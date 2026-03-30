/**
 * Fortnox HTML Report Parsers
 *
 * Parses HTML exports from Fortnox reports into structured TypeScript objects.
 * Supports: Balansrapport, Resultatrapport, Huvudbok, Verifikationslista.
 *
 * All reports use Swedish number format: space as thousand separator, comma as decimal.
 */
import * as cheerio from 'cheerio'

// ── Shared types ──

export interface BalansAccount {
  accountNumber: number
  name: string
  ingBalans: number
  ingSaldo: number
  period: number
  utgBalans: number
}

export interface BalansSummary {
  label: string
  ingBalans: number
  ingSaldo: number
  period: number
  utgBalans: number
}

export interface BalansReport {
  accounts: BalansAccount[]
  summaries: BalansSummary[]
}

export interface ResultatAccount {
  accountNumber: number
  name: string
  period: number
  ackumulerat: number
  periodFgAr: number
}

export interface ResultatSummary {
  label: string
  period: number
  ackumulerat: number
  periodFgAr: number
}

export interface ResultatReport {
  accounts: ResultatAccount[]
  summaries: ResultatSummary[]
}

export interface HuvudbokTransaction {
  vernr: string
  date: string
  text: string
  debet: number
  kredit: number
  saldo: number
}

export interface HuvudbokAccount {
  accountNumber: number
  name: string
  ingaendeBalans: number | null
  ingaendeSaldo: { debet: number; kredit: number; saldo: number }
  transactions: HuvudbokTransaction[]
  omslutning: { debet: number; kredit: number; net: number }
  utgaendeSaldo: { debet: number; kredit: number; saldo: number }
}

export interface HuvudbokReport {
  accounts: HuvudbokAccount[]
  totalDebet: number
  totalKredit: number
}

export interface VoucherRow {
  accountNumber: number
  accountName: string
  debet: number
  kredit: number
}

export interface ParsedVoucher {
  series: string
  number: number
  date: string
  regDate: string
  text: string
  rows: VoucherRow[]
}

export interface VerifikationslistaReport {
  vouchers: ParsedVoucher[]
  antalVerifikat: number
  antalTransaktioner: number
  omslutningDebet: number
  omslutningKredit: number
}

// ── Amount parsing ──

export function parseSwedishAmount(raw: string): number {
  if (!raw) return 0
  // Strip &nbsp; (decoded as \u00A0), regular spaces, and trim
  const cleaned = raw.replace(/\u00A0/g, '').replace(/\s/g, '').trim()
  if (cleaned === '' || cleaned === '-') return 0
  // Replace comma with period for decimal
  const normalized = cleaned.replace(',', '.')
  const val = parseFloat(normalized)
  return isNaN(val) ? 0 : val
}

// ── Balans parser ──

export function parseBalansHtml(html: string): BalansReport {
  const $ = cheerio.load(html)
  const accounts: BalansAccount[] = []
  const summaries: BalansSummary[] = []

  // Account rows: tables with cellspacing="1" contain individual account data
  $('table[cellspacing="1"]').each((_i, table) => {
    const $table = $(table)
    const $a = $table.find('a').first()
    if (!$a.length) return

    const accountNumber = parseInt($a.text().trim(), 10)
    if (isNaN(accountNumber)) return

    // Account name is in the 3rd td (width="80%") of the inner table
    const name = $table.find('td[width="80%"]').first().text().trim()

    // The 4 amount cells are direct children <td width="15%"> of the main tr
    const amountCells = $table.find('> tbody > tr > td[width="15%"]')
    if (amountCells.length < 4) return

    accounts.push({
      accountNumber,
      name,
      ingBalans: parseSwedishAmount($(amountCells[0]).text()),
      ingSaldo: parseSwedishAmount($(amountCells[1]).text()),
      period: parseSwedishAmount($(amountCells[2]).text()),
      utgBalans: parseSwedishAmount($(amountCells[3]).text()),
    })
  })

  // Summary rows: tables without cellspacing="1" that have <b> in first td and 4 amount tds
  // These are <table width="100%" border="0"> with <tr valign="top">
  $('table[border="0"]').each((_i, table) => {
    const $table = $(table)
    // Skip account tables (have cellspacing)
    if ($table.attr('cellspacing') === '1') return
    if ($table.attr('cellspacing') === '0') return

    const $tr = $table.find('> tbody > tr').first()
    if (!$tr.length) return

    const $tds = $tr.children('td')
    if ($tds.length < 5) return

    // First td must contain <b> with label text (not just amounts)
    const $firstTd = $($tds[0])
    const $b = $firstTd.find('b').first()
    if (!$b.length) return

    const label = $b.text().trim()
    // Skip section headers (they don't have amount siblings)
    // Check if the other tds have <b> with amounts
    const $secondTd = $($tds[1])
    if (!$secondTd.find('b').length) return

    summaries.push({
      label,
      ingBalans: parseSwedishAmount($($tds[1]).text()),
      ingSaldo: parseSwedishAmount($($tds[2]).text()),
      period: parseSwedishAmount($($tds[3]).text()),
      utgBalans: parseSwedishAmount($($tds[4]).text()),
    })
  })

  return { accounts, summaries }
}

// ── Resultat parser ──

export function parseResultatHtml(html: string): ResultatReport {
  const $ = cheerio.load(html)
  const accounts: ResultatAccount[] = []
  const summaries: ResultatSummary[] = []

  // Account rows: tables with cellspacing="1", td width="55%" for account
  $('table[cellspacing="1"]').each((_i, table) => {
    const $table = $(table)
    const $a = $table.find('a').first()
    if (!$a.length) return

    const accountNumber = parseInt($a.text().trim(), 10)
    if (isNaN(accountNumber)) return

    const name = $table.find('td[width="80%"]').first().text().trim()

    // 3 amount cells: td width="15%"
    const amountCells = $table.find('> tbody > tr > td[width="15%"]')
    if (amountCells.length < 3) return

    accounts.push({
      accountNumber,
      name,
      period: parseSwedishAmount($(amountCells[0]).text()),
      ackumulerat: parseSwedishAmount($(amountCells[1]).text()),
      periodFgAr: parseSwedishAmount($(amountCells[2]).text()),
    })
  })

  // Summary rows: same pattern as Balans but with 3 amount columns
  $('table[border="0"]').each((_i, table) => {
    const $table = $(table)
    if ($table.attr('cellspacing') === '1') return
    if ($table.attr('cellspacing') === '0') return

    const $tr = $table.find('> tbody > tr').first()
    if (!$tr.length) return

    const $tds = $tr.children('td')
    if ($tds.length < 4) return

    const $firstTd = $($tds[0])
    const $b = $firstTd.find('b').first()
    if (!$b.length) return

    const label = $b.text().trim()
    const $secondTd = $($tds[1])
    if (!$secondTd.find('b').length) return

    summaries.push({
      label,
      period: parseSwedishAmount($($tds[1]).text()),
      ackumulerat: parseSwedishAmount($($tds[2]).text()),
      periodFgAr: parseSwedishAmount($($tds[3]).text()),
    })
  })

  return { accounts, summaries }
}

// ── Huvudbok parser ──

export function parseHuvudbokHtml(html: string): HuvudbokReport {
  const $ = cheerio.load(html)
  const accounts: HuvudbokAccount[] = []
  let totalDebet = 0
  let totalKredit = 0

  // All data rows are <tr> inside <table> with fixed layout
  // Account headers have class "rowheadbold"
  const allRows = $('tr')
  const rowArray: cheerio.Element[] = []
  allRows.each((_i, el) => rowArray.push(el))

  for (let i = 0; i < rowArray.length; i++) {
    const $row = $(rowArray[i])

    // Check for footer: "Huvudboksomslutning" (class is on <td>, not <tr>)
    const rowText = $row.text()
    if (rowText.includes('Huvudboksomslutning')) {
      const rightAligned = $row.find('td[align="right"]')
      if (rightAligned.length >= 2) {
        totalDebet = parseSwedishAmount($(rightAligned[0]).text())
        totalKredit = parseSwedishAmount($(rightAligned[1]).text())
      }
      continue
    }

    if (!$row.hasClass('rowheadbold')) continue

    const $tds = $row.children('td')
    const firstTdText = $($tds[0]).text().trim()

    const accountNumber = parseInt(firstTdText, 10)
    if (isNaN(accountNumber)) continue

    const name = $($tds[1]).text().trim()

    const account: HuvudbokAccount = {
      accountNumber,
      name,
      ingaendeBalans: null,
      ingaendeSaldo: { debet: 0, kredit: 0, saldo: 0 },
      transactions: [],
      omslutning: { debet: 0, kredit: 0, net: 0 },
      utgaendeSaldo: { debet: 0, kredit: 0, saldo: 0 },
    }

    // Walk subsequent rows until next rowheadbold or end
    for (let j = i + 1; j < rowArray.length; j++) {
      const $r = $(rowArray[j])
      if ($r.hasClass('rowheadbold')) break

      const text = $r.text().trim()
      if (!text || text === '') continue

      const rightCells = $r.find('td[align="right"]')

      if (text.includes('Ingående balans')) {
        // Last right-aligned cell is the IB amount
        if (rightCells.length > 0) {
          account.ingaendeBalans = parseSwedishAmount($(rightCells[rightCells.length - 1]).text())
        }
      } else if (text.includes('Ingående saldo')) {
        if (rightCells.length >= 3) {
          account.ingaendeSaldo = {
            debet: parseSwedishAmount($(rightCells[0]).text()),
            kredit: parseSwedishAmount($(rightCells[1]).text()),
            saldo: parseSwedishAmount($(rightCells[2]).text()),
          }
        }
      } else if (text.includes('Omslutning')) {
        if (rightCells.length >= 3) {
          account.omslutning = {
            debet: parseSwedishAmount($(rightCells[0]).text()),
            kredit: parseSwedishAmount($(rightCells[1]).text()),
            net: parseSwedishAmount($(rightCells[2]).text()),
          }
        }
      } else if (text.includes('Utgående saldo')) {
        if (rightCells.length >= 3) {
          account.utgaendeSaldo = {
            debet: parseSwedishAmount($(rightCells[0]).text()),
            kredit: parseSwedishAmount($(rightCells[1]).text()),
            saldo: parseSwedishAmount($(rightCells[2]).text()),
          }
        }
      } else {
        // Transaction row: has <a> tag with vernr
        const $a = $r.find('a').first()
        const vernrText = $a.length ? $a.text().trim() : ''
        if (vernrText && vernrText !== '') {
          const $allTds = $r.children('td')
          // Columns: Konto(empty), Vernr, Proj, Datum, Text, spacer, Debet, Kredit, Saldo
          const dateTd = $allTds.length > 3 ? $($allTds[3]).text().trim() : ''
          const textTd = $allTds.length > 4 ? $($allTds[4]).text().trim() : ''

          if (rightCells.length >= 3) {
            account.transactions.push({
              vernr: vernrText,
              date: dateTd.replace(/\u00A0/g, '').trim(),
              text: textTd,
              debet: parseSwedishAmount($(rightCells[0]).text()),
              kredit: parseSwedishAmount($(rightCells[1]).text()),
              saldo: parseSwedishAmount($(rightCells[2]).text()),
            })
          }
        }
      }
    }

    accounts.push(account)
  }

  return { accounts, totalDebet, totalKredit }
}

// ── Verifikationslista parser ──

export function parseVerifikationslistaHtml(html: string): VerifikationslistaReport {
  const $ = cheerio.load(html)
  const vouchers: ParsedVoucher[] = []
  let antalVerifikat = 0
  let antalTransaktioner = 0
  let omslutningDebet = 0
  let omslutningKredit = 0

  // All rows in the main table
  const allRows: cheerio.Element[] = []
  $('tr').each((_i, el) => allRows.push(el))

  for (let i = 0; i < allRows.length; i++) {
    const $row = $(allRows[i])

    // Footer: "Antal verifikat:"
    const rowText = $row.text()
    if (rowText.includes('Antal verifikat:')) {
      const $tds = $row.children('td')
      // Structure: <td colspan="3">Antal verifikat:</td><td>4434</td><td colspan="2">Omslutning:</td><td>debet</td><td>kredit</td>
      $tds.each((_j, td) => {
        const tdText = $(td).text().trim()
        const numMatch = tdText.match(/^\d[\d\s]*[,.]?\d*$/)
        if (numMatch) {
          const val = parseSwedishAmount(tdText)
          if (antalVerifikat === 0 && val > 0 && val === Math.floor(val)) {
            antalVerifikat = val
          }
        }
      })
      // Get omslutning from the last two tds
      if ($tds.length >= 2) {
        const lastTwo = $tds.slice(-2)
        omslutningDebet = parseSwedishAmount($(lastTwo[0]).text())
        omslutningKredit = parseSwedishAmount($(lastTwo[1]).text())
      }
      continue
    }
    if (rowText.includes('Antal transaktioner:')) {
      const $tds = $row.children('td')
      $tds.each((_j, td) => {
        const tdText = $(td).text().trim()
        const val = parseInt(tdText.replace(/\s/g, ''), 10)
        if (!isNaN(val) && val > 0 && antalTransaktioner === 0) {
          antalTransaktioner = val
        }
      })
      continue
    }

    // Voucher header: font-weight: bold style
    const style = $row.attr('style') || ''
    if (!style.includes('font-weight') || !style.includes('bold')) continue

    const $tds = $row.children('td')
    if ($tds.length < 4) continue

    const vernrText = $($tds[0]).text().trim()
    if (!vernrText) continue

    // Parse series and number: "A 1", "D 1377"
    const vernrMatch = vernrText.match(/^([A-Z]+)\s+(\d+)$/)
    if (!vernrMatch) continue

    const series = vernrMatch[1]
    const number = parseInt(vernrMatch[2], 10)
    const date = $($tds[1]).text().trim()
    const regDate = $($tds[2]).text().trim()
    // Text is in td with colspan="2" or the 5th td
    let voucherText = ''
    $tds.each((_j, td) => {
      const $td = $(td)
      if ($td.attr('colspan') === '2') {
        voucherText = $td.text().trim()
      }
    })
    if (!voucherText && $tds.length > 4) {
      voucherText = $($tds[4]).text().trim()
    }

    const rows: VoucherRow[] = []

    // Walk subsequent rows for transaction rows until next bold row or <hr>
    for (let j = i + 1; j < allRows.length; j++) {
      const $r = $(allRows[j])
      const rStyle = $r.attr('style') || ''
      if (rStyle.includes('font-weight') && rStyle.includes('bold')) break

      // Check for <hr> separator (end of voucher)
      if ($r.find('hr').length > 0) break

      // Transaction row: has td width="10%" with account number
      const $rTds = $r.children('td')
      if ($rTds.length < 6) continue

      const accountTd = $r.find('td[width="10%"]').first()
      const accountText = accountTd.text().trim()
      const accountNum = parseInt(accountText, 10)
      if (isNaN(accountNum) || accountNum < 1000 || accountNum > 9999) continue

      // Account name is in td with colspan="2" or width="38%"
      let accountName = ''
      $rTds.each((_k, td) => {
        const $td = $(td)
        if (($td.attr('colspan') === '2' || $td.attr('width') === '38%') && $td.hasClass('summa') === false) {
          const t = $td.text().trim()
          if (t && t.length > 0 && isNaN(parseInt(t, 10))) {
            accountName = t
          }
        }
      })

      // Debet and kredit are in class="summa" tds
      const summaCells = $r.find('td.summa')
      let debet = 0
      let kredit = 0
      if (summaCells.length >= 2) {
        debet = parseSwedishAmount($(summaCells[0]).text())
        kredit = parseSwedishAmount($(summaCells[1]).text())
      }

      rows.push({ accountNumber: accountNum, accountName, debet, kredit })
    }

    vouchers.push({ series, number, date, regDate, text: voucherText, rows })
  }

  return { vouchers, antalVerifikat, antalTransaktioner, omslutningDebet, omslutningKredit }
}
