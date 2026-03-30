/**
 * Fortnox HTML Crosscheck Tests
 *
 * Validates SIE4 import by comparing DB data against Fortnox HTML report exports.
 * Covers data NOT tested by fortnox-crosscheck.test.ts:
 * - Every voucher (series, number, date) via Verifikationslista
 * - Every voucher row (account, debet/kredit) via Verifikationslista
 * - Per-account IB, UB, and omslutning via Huvudbok
 *
 * Source HTML files: SIE/BYGG-VALIDATION-MATERIALL/
 *
 * SIGN CONVENTIONS:
 * - Balansrapport (IB/UB): DB values match HTML directly
 * - Resultatrapport (RES): HTML negates amounts. DB value = -1 × HTML value
 * - Verifikationslista: HTML has separate Debet/Kredit columns (positive).
 *   DB amount is signed: positive=debet, negative=kredit.
 *   For each row: DB amount ≈ htmlDebet - htmlKredit
 * - Huvudbok: IB/UB match DB directly. Omslutning debet/kredit are unsigned.
 *
 * TRANSACTION COUNTS:
 * - Verifikationslista shows only #TRANS rows (13,528 for Bygg)
 * - SIE4 file also has #BTRANS (307) and #RTRANS (393) = 14,228 total
 * - Fortnox footer "Antal transaktioner: 13835" = TRANS + BTRANS
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { parseSIE4 } from '../sie4-parser.js'
import { importToSupabase } from '../sie4-importer.js'
import {
  parseBalansHtml,
  parseResultatHtml,
  parseHuvudbokHtml,
  parseVerifikationslistaHtml,
  type BalansReport,
  type ResultatReport,
  type HuvudbokReport,
  type VerifikationslistaReport,
} from '../fortnox-html-parser.js'

const SUPABASE_URL = process.env.SUPABASE_URL || 'http://127.0.0.1:54421'
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || ''

let client: SupabaseClient
let supabaseAvailable = false
try {
  client = createClient(SUPABASE_URL, SUPABASE_KEY)
  const { error } = await client.from('accounts').select('id').limit(1)
  supabaseAvailable = !error
} catch {
  supabaseAvailable = false
}

// ── DB helpers (same pattern as fortnox-crosscheck.test.ts) ──

async function truncateAll(c: SupabaseClient) {
  const tables = [
    'voucher_rows', 'vouchers', 'period_balances', 'period_results',
    'closing_balances', 'opening_balances', 'sru_codes', 'accounts',
    'objects', 'dimensions', 'financial_years', 'company_info',
  ]
  for (const table of tables) {
    await c.from(table).delete().not('id', 'is', null)
  }
}

async function importFile(path: string) {
  const buffer = readFileSync(resolve(path))
  const parsed = parseSIE4(buffer)
  await importToSupabase(parsed, client)
}

async function getFyId(): Promise<string> {
  const { data } = await client.from('financial_years').select('id').eq('year_index', 0).single()
  return data!.id
}

async function getUB(fyId: string): Promise<Map<number, number>> {
  const all: Array<{ account_number: number; amount: string }> = []
  let offset = 0
  while (true) {
    const { data } = await client.from('closing_balances')
      .select('account_number, amount')
      .eq('financial_year_id', fyId)
      .range(offset, offset + 999)
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < 1000) break
    offset += 1000
  }
  return new Map(all.map(r => [r.account_number, parseFloat(r.amount)]))
}

async function getIB(fyId: string): Promise<Map<number, number>> {
  const all: Array<{ account_number: number; amount: string }> = []
  let offset = 0
  while (true) {
    const { data } = await client.from('opening_balances')
      .select('account_number, amount')
      .eq('financial_year_id', fyId)
      .range(offset, offset + 999)
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < 1000) break
    offset += 1000
  }
  return new Map(all.map(r => [r.account_number, parseFloat(r.amount)]))
}

async function getRES(fyId: string): Promise<Map<number, number>> {
  const all: Array<{ account_number: number; amount: string }> = []
  let offset = 0
  while (true) {
    const { data } = await client.from('period_results')
      .select('account_number, amount')
      .eq('financial_year_id', fyId)
      .range(offset, offset + 999)
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < 1000) break
    offset += 1000
  }
  return new Map(all.map(r => [r.account_number, parseFloat(r.amount)]))
}

async function getVouchers(fyId: string): Promise<Map<string, {
  series: string; voucher_number: number; date: string; description: string
}>> {
  const all: Array<{ series: string; voucher_number: number; date: string; description: string }> = []
  let offset = 0
  while (true) {
    const { data } = await client.from('vouchers')
      .select('series, voucher_number, date, description')
      .eq('financial_year_id', fyId)
      .range(offset, offset + 999)
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < 1000) break
    offset += 1000
  }
  return new Map(all.map(v => [`${v.series}-${v.voucher_number}`, v]))
}

async function getVoucherRowsByVoucher(fyId: string): Promise<Map<string, Array<{
  account_number: number; amount: number; transaction_type: string
}>>> {
  // First get all voucher IDs with series+number
  const voucherIds: Array<{ id: string; series: string; voucher_number: number }> = []
  let offset = 0
  while (true) {
    const { data } = await client.from('vouchers')
      .select('id, series, voucher_number')
      .eq('financial_year_id', fyId)
      .range(offset, offset + 999)
    if (!data || data.length === 0) break
    voucherIds.push(...data)
    if (data.length < 1000) break
    offset += 1000
  }
  const idToKey = new Map(voucherIds.map(v => [v.id, `${v.series}-${v.voucher_number}`]))

  // Then get all voucher rows
  const map = new Map<string, Array<{ account_number: number; amount: number; transaction_type: string }>>()
  offset = 0
  while (true) {
    const { data } = await client.from('voucher_rows')
      .select('voucher_id, account_number, amount, transaction_type')
      .range(offset, offset + 999)
    if (!data || data.length === 0) break
    for (const row of data) {
      const key = idToKey.get(row.voucher_id)
      if (!key) continue
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push({
        account_number: row.account_number,
        amount: parseFloat(row.amount),
        transaction_type: row.transaction_type,
      })
    }
    if (data.length < 1000) break
    offset += 1000
  }
  return map
}

// ── Parse HTML files once ──

const HTML_DIR = 'SIE/BYGG-VALIDATION-MATERIALL'
let balans: BalansReport
let resultat: ResultatReport
let huvudbok: HuvudbokReport
let verifikationslista: VerifikationslistaReport

try {
  balans = parseBalansHtml(readFileSync(resolve(HTML_DIR, 'Balans.html'), 'utf-8'))
  resultat = parseResultatHtml(readFileSync(resolve(HTML_DIR, 'Resultat.html'), 'utf-8'))
  huvudbok = parseHuvudbokHtml(readFileSync(resolve(HTML_DIR, 'Report-huvudbok.html'), 'utf-8'))
  verifikationslista = parseVerifikationslistaHtml(readFileSync(resolve(HTML_DIR, 'Report-verfikationslista-alla.html'), 'utf-8'))
} catch {
  // Files might not exist in CI; tests will be skipped
}

const htmlAvailable = !!balans && !!verifikationslista

// ── Parser sanity checks (no DB needed) ──

describe.skipIf(!htmlAvailable)('Fortnox HTML Parser — Sanity Checks', () => {
  it('Balans: parses accounts', () => {
    expect(balans.accounts.length).toBeGreaterThan(50)
  })

  it('Resultat: parses accounts', () => {
    expect(resultat.accounts.length).toBeGreaterThan(80)
  })

  it('Verifikationslista: 4434 vouchers', () => {
    expect(verifikationslista.vouchers.length).toBe(4434)
    expect(verifikationslista.antalVerifikat).toBe(4434)
  })

  it('Verifikationslista: 13528 transaction rows (= SIE #TRANS count)', () => {
    const totalRows = verifikationslista.vouchers.reduce((sum, v) => sum + v.rows.length, 0)
    expect(totalRows).toBe(13528)
  })

  it('Verifikationslista: omslutning debet = kredit = 267,213,209.07', () => {
    expect(Math.abs(verifikationslista.omslutningDebet - 267213209.07)).toBeLessThan(0.01)
    expect(Math.abs(verifikationslista.omslutningKredit - 267213209.07)).toBeLessThan(0.01)
  })

  it('Huvudbok: 160 accounts', () => {
    expect(huvudbok.accounts.length).toBe(160)
  })

  it('Huvudbok: total omslutning matches Verifikationslista', () => {
    expect(Math.abs(huvudbok.totalDebet - verifikationslista.omslutningDebet)).toBeLessThan(0.01)
    expect(Math.abs(huvudbok.totalKredit - verifikationslista.omslutningKredit)).toBeLessThan(0.01)
  })

  it('Every voucher balances (debet = kredit)', () => {
    let imbalanced = 0
    for (const v of verifikationslista.vouchers) {
      const totalDebet = v.rows.reduce((sum, r) => sum + r.debet, 0)
      const totalKredit = v.rows.reduce((sum, r) => sum + r.kredit, 0)
      if (Math.abs(totalDebet - totalKredit) >= 0.01) imbalanced++
    }
    expect(imbalanced, `${imbalanced} vouchers don't balance`).toBe(0)
  })
})

// ── DB crosscheck tests ──

describe.skipIf(!supabaseAvailable || !htmlAvailable)('Fortnox HTML Crosscheck — Byggnadsställningsentreprenad', () => {
  let fyId: string
  let ub: Map<number, number>
  let ib: Map<number, number>
  let res: Map<number, number>
  let dbVouchers: Map<string, { series: string; voucher_number: number; date: string; description: string }>
  let dbVoucherRows: Map<string, Array<{ account_number: number; amount: number; transaction_type: string }>>

  beforeAll(async () => {
    await truncateAll(client)
    await importFile('SIE/ByggnadsställningsentreprenadiStockholmAB20260330_170428.se')
    fyId = await getFyId()
    ;[ub, ib, res, dbVouchers, dbVoucherRows] = await Promise.all([
      getUB(fyId), getIB(fyId), getRES(fyId), getVouchers(fyId), getVoucherRowsByVoucher(fyId),
    ])
  }, 60_000)

  // ── Balans HTML vs DB ──

  describe('Balans HTML vs DB', () => {
    it('every account utgBalans matches DB closing_balances', () => {
      let mismatches = 0
      const errors: string[] = []
      for (const account of balans.accounts) {
        const dbValue = ub.get(account.accountNumber)
        if (dbValue === undefined) {
          errors.push(`UB ${account.accountNumber}: missing in DB`)
          mismatches++
          continue
        }
        if (Math.abs(dbValue - account.utgBalans) >= 0.01) {
          errors.push(`UB ${account.accountNumber}: DB=${dbValue} HTML=${account.utgBalans}`)
          mismatches++
        }
      }
      expect(mismatches, errors.join('\n')).toBe(0)
    })

    it('every account ingBalans matches DB opening_balances', () => {
      let mismatches = 0
      const errors: string[] = []
      for (const account of balans.accounts) {
        // Only balance sheet accounts (1xxx-2xxx) have IB in DB
        if (account.accountNumber < 1000 || account.accountNumber >= 3000) continue
        if (account.ingBalans === 0) continue // Skip zero IB, might not be in DB

        const dbValue = ib.get(account.accountNumber)
        if (dbValue === undefined) continue // Account might not have explicit IB
        if (Math.abs(dbValue - account.ingBalans) >= 0.01) {
          errors.push(`IB ${account.accountNumber}: DB=${dbValue} HTML=${account.ingBalans}`)
          mismatches++
        }
      }
      expect(mismatches, errors.join('\n')).toBe(0)
    })

    it('SUMMA TILLGÅNGAR matches', () => {
      const summaTillgangar = balans.summaries.find(s => s.label === 'SUMMA TILLGÅNGAR')
      expect(summaTillgangar).toBeDefined()
      let dbSum = 0
      for (const [acc, amt] of ub) {
        if (acc >= 1000 && acc < 2000) dbSum += amt
      }
      expect(Math.abs(dbSum - summaTillgangar!.utgBalans), `DB=${dbSum} HTML=${summaTillgangar!.utgBalans}`).toBeLessThan(0.02)
    })
  })

  // ── Resultat HTML vs DB ──

  describe('Resultat HTML vs DB', () => {
    it('every account period matches DB period_results (sign-inverted)', () => {
      let mismatches = 0
      const errors: string[] = []
      for (const account of resultat.accounts) {
        if (account.period === 0) continue // Skip zero-amount accounts
        const dbValue = res.get(account.accountNumber)
        if (dbValue === undefined) {
          errors.push(`RES ${account.accountNumber}: missing in DB`)
          mismatches++
          continue
        }
        // DB value = -1 × HTML value
        if (Math.abs(dbValue - (-account.period)) >= 0.01) {
          errors.push(`RES ${account.accountNumber}: DB=${dbValue} expected=${-account.period}`)
          mismatches++
        }
      }
      expect(mismatches, errors.join('\n')).toBe(0)
    })

    it('BERÄKNAT RESULTAT matches', () => {
      const beraknat = resultat.summaries.find(s => s.label === 'BERÄKNAT RESULTAT')
      expect(beraknat).toBeDefined()
      let dbSum = 0
      for (const [, amt] of res) dbSum += amt
      // DB sum is negative (credit), Fortnox shows positive
      expect(Math.abs((-dbSum) - beraknat!.period), `DB=${-dbSum} HTML=${beraknat!.period}`).toBeLessThan(0.02)
    })
  })

  // ── Huvudbok HTML vs DB ──

  describe('Huvudbok HTML vs DB', () => {
    it('IB per account matches DB opening_balances', () => {
      let mismatches = 0
      const errors: string[] = []
      for (const account of huvudbok.accounts) {
        if (account.ingaendeBalans === null) continue
        const dbValue = ib.get(account.accountNumber)
        if (dbValue === undefined) continue
        if (Math.abs(dbValue - account.ingaendeBalans) >= 0.01) {
          errors.push(`IB ${account.accountNumber}: DB=${dbValue} HTML=${account.ingaendeBalans}`)
          mismatches++
        }
      }
      expect(mismatches, errors.join('\n')).toBe(0)
    })

    it('Utgående saldo per account matches DB closing_balances', () => {
      let mismatches = 0
      const errors: string[] = []
      for (const account of huvudbok.accounts) {
        const dbValue = ub.get(account.accountNumber)
        if (dbValue === undefined) continue
        if (Math.abs(dbValue - account.utgaendeSaldo.saldo) >= 0.01) {
          errors.push(`UB ${account.accountNumber}: DB=${dbValue} HTML=${account.utgaendeSaldo.saldo}`)
          mismatches++
        }
      }
      expect(mismatches, errors.join('\n')).toBe(0)
    })

    it('Omslutning per account matches sum of DB voucher_rows', () => {
      // Sum all normal voucher rows per account
      const accountDebet = new Map<number, number>()
      const accountKredit = new Map<number, number>()
      for (const [, rows] of dbVoucherRows) {
        for (const row of rows) {
          if (row.transaction_type !== 'normal') continue
          if (row.amount > 0) {
            accountDebet.set(row.account_number, (accountDebet.get(row.account_number) || 0) + row.amount)
          } else if (row.amount < 0) {
            accountKredit.set(row.account_number, (accountKredit.get(row.account_number) || 0) + Math.abs(row.amount))
          }
        }
      }

      let mismatches = 0
      const errors: string[] = []
      for (const account of huvudbok.accounts) {
        if (account.omslutning.debet === 0 && account.omslutning.kredit === 0) continue

        const dbDebet = accountDebet.get(account.accountNumber) || 0
        const dbKredit = accountKredit.get(account.accountNumber) || 0
        if (Math.abs(dbDebet - account.omslutning.debet) >= 0.01) {
          errors.push(`Omsl debet ${account.accountNumber}: DB=${dbDebet} HTML=${account.omslutning.debet}`)
          mismatches++
        }
        if (Math.abs(dbKredit - account.omslutning.kredit) >= 0.01) {
          errors.push(`Omsl kredit ${account.accountNumber}: DB=${dbKredit} HTML=${account.omslutning.kredit}`)
          mismatches++
        }
      }
      expect(mismatches, errors.join('\n')).toBe(0)
    })
  })

  // ── Verifikationslista HTML vs DB ──

  describe('Verifikationslista HTML vs DB', () => {
    it('total voucher count matches DB', () => {
      expect(dbVouchers.size).toBe(verifikationslista.vouchers.length)
    })

    it('every voucher exists in DB with correct series, number, date', () => {
      let mismatches = 0
      const errors: string[] = []
      for (const v of verifikationslista.vouchers) {
        const key = `${v.series}-${v.number}`
        const dbV = dbVouchers.get(key)
        if (!dbV) {
          errors.push(`Missing: ${key}`)
          mismatches++
          continue
        }
        if (dbV.date !== v.date) {
          errors.push(`Date ${key}: DB=${dbV.date} HTML=${v.date}`)
          mismatches++
        }
      }
      expect(mismatches, errors.slice(0, 20).join('\n')).toBe(0)
    })

    it('every voucher row has correct account and amount', () => {
      let mismatches = 0
      let checked = 0
      const errors: string[] = []

      for (const v of verifikationslista.vouchers) {
        const key = `${v.series}-${v.number}`
        const dbRows = dbVoucherRows.get(key)
        if (!dbRows) continue

        // Only compare normal rows (verifikationslista doesn't show BTRANS/RTRANS)
        const normalDbRows = dbRows.filter(r => r.transaction_type === 'normal')

        if (normalDbRows.length !== v.rows.length) {
          errors.push(`Row count ${key}: DB=${normalDbRows.length} HTML=${v.rows.length}`)
          mismatches++
          continue
        }

        // Sort both by account+amount for order-independent comparison
        const sortKey = (r: { account_number: number; amount: number }) =>
          `${r.account_number}:${r.amount.toFixed(2)}`
        const sortedDb = [...normalDbRows].sort((a, b) => sortKey(a).localeCompare(sortKey(b)))
        const sortedHtml = [...v.rows]
          .map(r => ({ account_number: r.accountNumber, amount: r.debet - r.kredit }))
          .sort((a, b) => sortKey(a).localeCompare(sortKey(b)))

        for (let r = 0; r < sortedHtml.length; r++) {
          const htmlRow = sortedHtml[r]
          const dbRow = sortedDb[r]
          checked++

          if (dbRow.account_number !== htmlRow.account_number) {
            errors.push(`${key} row ${r} account: DB=${dbRow.account_number} HTML=${htmlRow.account_number}`)
            mismatches++
            continue
          }

          if (Math.abs(dbRow.amount - htmlRow.amount) >= 0.01) {
            errors.push(`${key} row ${r} amount: DB=${dbRow.amount} HTML=${htmlRow.amount}`)
            mismatches++
          }
        }
      }

      expect(checked).toBeGreaterThan(10000)
      expect(mismatches, errors.slice(0, 20).join('\n')).toBe(0)
    })

    it('total debet sum matches HTML omslutning', () => {
      let dbTotalDebet = 0
      for (const [, rows] of dbVoucherRows) {
        for (const row of rows) {
          if (row.transaction_type !== 'normal') continue
          if (row.amount > 0) dbTotalDebet += row.amount
        }
      }
      expect(
        Math.abs(dbTotalDebet - verifikationslista.omslutningDebet),
        `DB total debet=${dbTotalDebet} HTML=${verifikationslista.omslutningDebet}`
      ).toBeLessThan(0.02)
    })

    it('total kredit sum matches HTML omslutning', () => {
      let dbTotalKredit = 0
      for (const [, rows] of dbVoucherRows) {
        for (const row of rows) {
          if (row.transaction_type !== 'normal') continue
          if (row.amount < 0) dbTotalKredit += Math.abs(row.amount)
        }
      }
      expect(
        Math.abs(dbTotalKredit - verifikationslista.omslutningKredit),
        `DB total kredit=${dbTotalKredit} HTML=${verifikationslista.omslutningKredit}`
      ).toBeLessThan(0.02)
    })
  })
})
