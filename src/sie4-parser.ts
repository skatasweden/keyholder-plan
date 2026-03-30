import iconv from 'iconv-lite'
import type { ParsedSIE4 } from './types.js'

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
    vouchers: [],
    parse_errors: [],
  }

  const accountTypes = new Map<number, string>()

  let i = 0
  while (i < lines.length) {
    const line = lines[i].trim()
    i++

    if (!line || !line.startsWith('#')) continue

    try {
      const fields = parseFields(line)
      const tag = fields[0]

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
            quarter: parseInt(fields[4]) || 0,
          })
          break
        case '#UB':
          result.closing_balances.push({
            year_index: parseInt(fields[1]),
            account_number: parseInt(fields[2]),
            amount: parseFloat(fields[3]) || 0,
            quarter: parseInt(fields[4]) || 0,
          })
          break
        case '#RES':
          result.period_results.push({
            year_index: parseInt(fields[1]),
            account_number: parseInt(fields[2]),
            amount: parseFloat(fields[3]) || 0,
          })
          break
        case '#PSALDO': {
          const dim = parseDimension(fields[4] || '{}')
          // Only keep aggregate entries (empty dimension) to avoid duplicates
          if (dim.dimNumber === null) {
            result.period_balances.push({
              year_index: parseInt(fields[1]),
              period: parseInt(fields[2]),
              account_number: parseInt(fields[3]),
              amount: parseFloat(fields[5]) || 0,
              quarter: parseInt(fields[6]) || 0,
            })
          }
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

            try {
              const rowFields = parseFields(rowLine)
              const rowTag = rowFields[0]
              if (rowTag === '#TRANS' || rowTag === '#BTRANS' || rowTag === '#RTRANS') {
                const type = rowTag === '#TRANS' ? 'normal' : rowTag === '#BTRANS' ? 'btrans' : 'rtrans'
                const accountNum = parseInt(rowFields[1])
                const dim = parseDimension(rowFields[2] || '{}')
                const amount = parseFloat(rowFields[3]) || 0
                // SIE field order: #TRANS account {dim} amount transdate transtext quantity sign
                const transText = rowFields[5] || ''
                const quantity = parseInt(rowFields[6]) || 0
                const sign = rowFields[7] !== undefined ? (rowFields[7] || null) : null

                rows.push({
                  type,
                  account_number: accountNum,
                  dim_number: dim.dimNumber,
                  object_number: dim.objectNumber,
                  amount,
                  description: transText,
                  quarter: quantity,
                  name: sign,
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
          // Unknown tag — skip silently
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
