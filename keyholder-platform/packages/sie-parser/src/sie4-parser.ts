import iconv from 'iconv-lite'
import type { ParsedSIE4 } from './types'

export function parseSIE4(fileBuffer: Buffer): ParsedSIE4 {
  const text = iconv.decode(fileBuffer, 'cp437').replace(/\r/g, '')
  const lines = text.split('\n')

  const result: ParsedSIE4 = {
    meta: {
      flagga: 0,
      format: '',
      sietyp: 0,
      program: '',
      generated: '',
      fortnox_number: '',
      company_name: '',
      org_number: '',
      address: { contact: '', street: '', postal: '', phone: '' },
      balance_date: '',
      account_plan_type: '',
      sni_code: null,
      company_type: null,
      comment: null,
      tax_year: null,
      currency: 'SEK',
    },
    financial_years: [],
    accounts: [],
    sru_codes: [],
    dimensions: [],
    objects: [],
    opening_balances: [],
    closing_balances: [],
    period_results: [],
    period_balances: [],
    period_budgets: [],
    vouchers: [],
    parse_errors: [],
    crc_verified: null,
  }

  const accountTypes = new Map<number, string>()
  const accountUnits = new Map<number, string>()

  // CRC-32 state (Phase 9)
  let crcEnabled = false
  let crcAccumulator = 0xFFFFFFFF

  let i = 0
  while (i < lines.length) {
    const line = lines[i].trim()
    i++

    if (!line || !line.startsWith('#')) continue

    try {
      const fields = parseFields(line)
      const tag = fields[0]

      // CRC-32: check for #KSUMMA before processing
      if (tag === '#KSUMMA') {
        if (!crcEnabled) {
          // First #KSUMMA: start accumulating
          crcEnabled = true
          crcAccumulator = 0xFFFFFFFF
        } else {
          // Second #KSUMMA: verify
          const expected = parseInt(fields[1])
          const actual = (crcAccumulator ^ 0xFFFFFFFF) >>> 0
          result.crc_verified = actual === expected
          if (!result.crc_verified) {
            result.parse_errors.push({
              line_number: i,
              line,
              error: `CRC-32 mismatch: expected ${expected}, got ${actual}`,
            })
          }
          crcEnabled = false
        }
        continue
      }

      // CRC-32: accumulate if enabled
      if (crcEnabled) {
        crcAccumulator = crcLine(line, crcAccumulator)
      }

      switch (tag) {
        case '#FLAGGA':
          result.meta.flagga = parseInt(fields[1]) || 0
          break
        case '#FORMAT':
          result.meta.format = fields[1] || ''
          break
        case '#SIETYP':
          result.meta.sietyp = parseInt(fields[1]) || 0
          break
        case '#PROGRAM':
          result.meta.program = fields[1] || ''
          break
        case '#GEN':
          result.meta.generated = fields[1] || ''
          break
        case '#FNR':
          result.meta.fortnox_number = fields[1] || ''
          break
        case '#FNAMN':
          result.meta.company_name = fields[1] || ''
          break
        case '#ORGNR':
          result.meta.org_number = fields[1] || ''
          break
        case '#ADRESS':
          result.meta.address.contact = fields[1] || ''
          result.meta.address.street = fields[2] || ''
          result.meta.address.postal = fields[3] || ''
          result.meta.address.phone = fields[4] || ''
          break
        case '#OMFATTN':
          result.meta.balance_date = formatDate(fields[1] || '')
          break
        case '#KPTYP':
          result.meta.account_plan_type = fields[1] || ''
          break
        // Phase 5: optional metadata tags
        case '#BKOD':
          result.meta.sni_code = fields[1] || null
          break
        case '#FTYP':
          result.meta.company_type = fields[1] || null
          break
        case '#PROSA':
          result.meta.comment = fields[1] || null
          break
        case '#TAXAR':
          result.meta.tax_year = parseInt(fields[1]) || null
          break
        case '#VALUTA':
          result.meta.currency = fields[1] || 'SEK'
          break
        case '#ENHET':
          accountUnits.set(parseInt(fields[1]), fields[2] || '')
          break
        case '#RAR': {
          const yearIndex = parseInt(fields[1])
          result.financial_years.push({
            year_index: yearIndex,
            start_date: formatDate(fields[2] || ''),
            end_date: formatDate(fields[3] || ''),
          })
          break
        }
        case '#KONTO':
          result.accounts.push({
            account_number: parseInt(fields[1]),
            name: fields[2] || '',
            account_type: null,
            quantity_unit: null,
          })
          break
        case '#KTYP':
          accountTypes.set(parseInt(fields[1]), fields[2] || '')
          break
        case '#SRU':
          result.sru_codes.push({
            account_number: parseInt(fields[1]),
            sru_code: fields[2] || '',
          })
          break
        case '#DIM':
          result.dimensions.push({
            dimension_number: parseInt(fields[1]),
            name: fields[2] || '',
            parent_dimension: null,
          })
          break
        // Phase 6: hierarchical sub-dimensions
        case '#UNDERDIM':
          result.dimensions.push({
            dimension_number: parseInt(fields[1]),
            name: fields[2] || '',
            parent_dimension: parseInt(fields[3]) || null,
          })
          break
        case '#OBJEKT':
          result.objects.push({
            dimension_number: parseInt(fields[1]),
            object_number: fields[2] || '',
            name: (fields[3] || '').trim(),
          })
          break
        case '#IB':
          result.opening_balances.push({
            year_index: parseInt(fields[1]),
            account_number: parseInt(fields[2]),
            amount: parseFloat(fields[3]) || 0,
            quantity: parseInt(fields[4]) || 0,
            dimension_number: null,
            object_number: null,
          })
          break
        // Phase 7: object-level opening balances
        case '#OIB': {
          const dim = parseDimension(fields[3] || '{}')
          result.opening_balances.push({
            year_index: parseInt(fields[1]),
            account_number: parseInt(fields[2]),
            amount: parseFloat(fields[4]) || 0,
            quantity: parseInt(fields[5]) || 0,
            dimension_number: dim.dimNumber,
            object_number: dim.objectNumber,
          })
          break
        }
        case '#UB':
          result.closing_balances.push({
            year_index: parseInt(fields[1]),
            account_number: parseInt(fields[2]),
            amount: parseFloat(fields[3]) || 0,
            quantity: parseInt(fields[4]) || 0,
            dimension_number: null,
            object_number: null,
          })
          break
        // Phase 7: object-level closing balances
        case '#OUB': {
          const dim = parseDimension(fields[3] || '{}')
          result.closing_balances.push({
            year_index: parseInt(fields[1]),
            account_number: parseInt(fields[2]),
            amount: parseFloat(fields[4]) || 0,
            quantity: parseInt(fields[5]) || 0,
            dimension_number: dim.dimNumber,
            object_number: dim.objectNumber,
          })
          break
        }
        case '#RES':
          result.period_results.push({
            year_index: parseInt(fields[1]),
            account_number: parseInt(fields[2]),
            amount: parseFloat(fields[3]) || 0,
          })
          break
        // Phase 4: PSALDO now stores ALL entries (with and without dimension)
        case '#PSALDO': {
          const dim = parseDimension(fields[4] || '{}')
          result.period_balances.push({
            year_index: parseInt(fields[1]),
            period: parseInt(fields[2]),
            account_number: parseInt(fields[3]),
            amount: parseFloat(fields[5]) || 0,
            quantity: parseInt(fields[6]) || 0,
            dimension_number: dim.dimNumber,
            object_number: dim.objectNumber,
          })
          break
        }
        // Phase 8: period budgets
        case '#PBUDGET': {
          const dim = parseDimension(fields[4] || '{}')
          result.period_budgets.push({
            year_index: parseInt(fields[1]),
            period: parseInt(fields[2]),
            account_number: parseInt(fields[3]),
            amount: parseFloat(fields[5]) || 0,
            quantity: parseInt(fields[6]) || 0,
            dimension_number: dim.dimNumber,
            object_number: dim.objectNumber,
          })
          break
        }
        case '#VER': {
          const series = fields[1] || ''
          const voucherNumber = parseInt(fields[2])
          const date = formatDate(fields[3] || '')
          const description = fields[4] || ''
          const registrationDate = formatDate(fields[5] || '')

          // Collect rows until closing }
          const rows: ParsedSIE4['vouchers'][0]['rows'] = []
          while (i < lines.length) {
            const rowLine = lines[i].trim()
            i++
            if (rowLine === '{') continue
            if (rowLine === '}') break

            // CRC-32: accumulate voucher block lines
            if (crcEnabled) {
              crcAccumulator = crcLine(rowLine, crcAccumulator)
            }

            try {
              const rowFields = parseFields(rowLine)
              const rowTag = rowFields[0]
              if (rowTag === '#TRANS' || rowTag === '#BTRANS' || rowTag === '#RTRANS') {
                const type = rowTag === '#TRANS' ? 'normal' : rowTag === '#BTRANS' ? 'btrans' : 'rtrans'
                const accountNum = parseInt(rowFields[1])
                // Phase 3: parse ALL dimension pairs
                const dims = parseDimensions(rowFields[2] || '{}')
                const firstDim = dims[0] || null
                const amount = parseFloat(rowFields[3]) || 0
                // SIE field order: #TRANS account {dim} amount transdat transtext quantity sign
                const transdat = rowFields[4] || ''
                const transText = rowFields[5] || ''
                const qty = parseInt(rowFields[6]) || 0
                const sig = rowFields[7] !== undefined ? (rowFields[7] || null) : null

                rows.push({
                  type,
                  account_number: accountNum,
                  dim_number: firstDim?.dimNumber ?? null,
                  object_number: firstDim?.objectNumber ?? null,
                  dimensions: dims.map(d => ({ dim_number: d.dimNumber, object_number: d.objectNumber })),
                  amount,
                  description: transText,
                  transaction_date: transdat ? formatDate(transdat) : null,
                  quantity: qty,
                  sign: sig,
                })
              }
            } catch (err) {
              result.parse_errors.push({
                line_number: i,
                line: rowLine,
                error: String(err),
              })
            }
          }

          result.vouchers.push({
            series,
            voucher_number: voucherNumber,
            date,
            description,
            registration_date: registrationDate,
            rows,
          })
          break
        }
        default:
          // Unknown tag — skip silently (per spec §7.1)
          break
      }
    } catch (err) {
      result.parse_errors.push({
        line_number: i,
        line,
        error: String(err),
      })
    }
  }

  // Merge #KTYP data into accounts
  for (const account of result.accounts) {
    const type = accountTypes.get(account.account_number)
    if (type === 'T' || type === 'S' || type === 'K' || type === 'I') {
      account.account_type = type
    }
    const unit = accountUnits.get(account.account_number)
    if (unit) {
      account.quantity_unit = unit
    }
  }

  return result
}

function formatDate(raw: string): string {
  // "20250101" → "2025-01-01"
  if (!raw || raw.length !== 8) return raw
  return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`
}

function parseDimension(field: string): { dimNumber: number | null; objectNumber: string | null } {
  // {} → null, null
  // {6 "P1040"} → 6, "P1040"
  const inner = field.replace(/[{}]/g, '').trim()
  if (!inner) return { dimNumber: null, objectNumber: null }

  const parts = parseFields(inner)
  return {
    dimNumber: parseInt(parts[0]) || null,
    objectNumber: parts[1] || null,
  }
}

// Phase 3: Parse ALL dimension pairs from an object list
function parseDimensions(field: string): Array<{ dimNumber: number; objectNumber: string }> {
  const inner = field.replace(/[{}]/g, '').trim()
  if (!inner) return []

  const parts = parseFields(inner)
  const result: Array<{ dimNumber: number; objectNumber: string }> = []
  for (let j = 0; j < parts.length - 1; j += 2) {
    const dimNum = parseInt(parts[j])
    const objNum = parts[j + 1]
    if (!isNaN(dimNum) && objNum) {
      result.push({ dimNumber: dimNum, objectNumber: objNum })
    }
  }
  return result
}

function parseFields(line: string): string[] {
  const fields: string[] = []
  let i = 0
  const str = line.trim()

  while (i < str.length) {
    // Skip whitespace
    while (i < str.length && (str[i] === ' ' || str[i] === '\t')) i++
    if (i >= str.length) break

    if (str[i] === '"') {
      // Quoted string — handle escaped quotes \"
      i++ // skip opening quote
      let value = ''
      while (i < str.length) {
        if (str[i] === '\\' && i + 1 < str.length && str[i + 1] === '"') {
          value += '"'
          i += 2
        } else if (str[i] === '"') {
          break
        } else {
          value += str[i]
          i++
        }
      }
      i++ // skip closing quote
      fields.push(value)
    } else if (str[i] === '{') {
      // Dimension block — grab the whole {...}
      let depth = 0
      let value = ''
      while (i < str.length) {
        if (str[i] === '{') depth++
        else if (str[i] === '}') {
          depth--
          if (depth === 0) {
            value += str[i]
            i++
            break
          }
        }
        value += str[i]
        i++
      }
      fields.push(value)
    } else {
      // Unquoted token
      let value = ''
      while (i < str.length && str[i] !== ' ' && str[i] !== '\t') {
        value += str[i]
        i++
      }
      fields.push(value)
    }
  }

  return fields
}

// Phase 9: CRC-32 implementation
// Polynomial: 0xEDB88320 (standard CRC-32, bit-reversed)
const crcTable = makeCrcTable()

function makeCrcTable(): Uint32Array {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let crc = i
    for (let j = 0; j < 8; j++) {
      if (crc & 1) {
        crc = (crc >>> 1) ^ 0xEDB88320
      } else {
        crc = crc >>> 1
      }
    }
    table[i] = crc >>> 0
  }
  return table
}

// Extract CRC-relevant bytes from a SIE line per spec §10.14:
// - Include tag and field content
// - Exclude whitespace between fields, quotes that delimit fields, and braces
// - Escaped quotes within fields DO count (the quote char itself)
// - Computed on CP437 byte values
function crcLine(line: string, crc: number): number {
  const buf = iconv.encode(line, 'cp437')
  let inQuote = false
  for (let j = 0; j < buf.length; j++) {
    const b = buf[j]
    if (b === 0x22) { // '"'
      // Check if escaped quote inside a field
      if (inQuote && j > 0 && buf[j - 1] === 0x5C) { // '\'
        // This is the closing backslash's quote — the backslash was already skipped
        // Actually per spec: escaped quotes within fields count as the quote char
        crc = (crc >>> 8) ^ crcTable[(crc ^ b) & 0xFF]
      } else {
        // Toggle quote state, don't include the delimiter quote
        inQuote = !inQuote
      }
    } else if (b === 0x7B || b === 0x7D) { // '{' or '}'
      // Braces excluded from CRC
    } else if (!inQuote && (b === 0x20 || b === 0x09)) {
      // Whitespace between fields excluded
    } else {
      crc = (crc >>> 8) ^ crcTable[(crc ^ b) & 0xFF]
    }
  }
  return crc >>> 0
}
