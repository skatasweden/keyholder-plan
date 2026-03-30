/**
 * Report View Tests
 *
 * Verifies that report_balansrapport() and report_resultatrapport()
 * SQL functions produce totals matching Fortnox PDF exports.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { parseSIE4 } from '../sie4-parser.js'
import { importToSupabase } from '../sie4-importer.js'

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

async function truncateAll(c: SupabaseClient) {
  const tables = [
    'voucher_row_objects', 'voucher_rows', 'vouchers',
    'period_budgets', 'period_balances', 'period_results',
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

interface BalansRow {
  account_number: number
  account_name: string
  ing_balans: number
  period: number
  utg_balans: number
}

interface ResultatRow {
  account_number: number
  account_name: string
  period: number
  ackumulerat: number
  period_fg_ar: number
}

async function getBalansrapport(fyId: string): Promise<BalansRow[]> {
  const { data, error } = await client.rpc('report_balansrapport', { p_financial_year_id: fyId })
  if (error) throw new Error(`report_balansrapport RPC failed: ${error.message}`)
  return (data as any[]).map(r => ({
    account_number: r.account_number,
    account_name: r.account_name,
    ing_balans: parseFloat(r.ing_balans),
    period: parseFloat(r.period),
    utg_balans: parseFloat(r.utg_balans),
  }))
}

async function getResultatrapport(fyId: string): Promise<ResultatRow[]> {
  const { data, error } = await client.rpc('report_resultatrapport', { p_financial_year_id: fyId })
  if (error) throw new Error(`report_resultatrapport RPC failed: ${error.message}`)
  return (data as any[]).map(r => ({
    account_number: r.account_number,
    account_name: r.account_name,
    period: parseFloat(r.period),
    ackumulerat: parseFloat(r.ackumulerat),
    period_fg_ar: parseFloat(r.period_fg_ar),
  }))
}

describe.skipIf(!supabaseAvailable)('Report Functions', () => {

  // ─────────────────────────────────────────────────────
  // RevIL AB
  // ─────────────────────────────────────────────────────
  describe('RevIL AB', () => {
    let balans: BalansRow[]
    let resultat: ResultatRow[]

    beforeAll(async () => {
      await truncateAll(client)
      await importFile('SIE/RevILAB20260330_165333.se')
      const fyId = await getFyId()
      balans = await getBalansrapport(fyId)
      resultat = await getResultatrapport(fyId)
    })

    describe('Balansrapport', () => {
      it('SUMMA TILLGANGAR should be 3 952 190,47', () => {
        const sum = balans
          .filter(r => r.account_number >= 1000 && r.account_number < 2000)
          .reduce((s, r) => s + r.utg_balans, 0)
        expect(Math.abs(sum - 3952190.47)).toBeLessThan(0.01)
      })

      it('BERAKNAT RESULTAT should be 869 954,78', () => {
        const sum = balans.reduce((s, r) => s + r.utg_balans, 0)
        expect(Math.abs(sum - 869954.78)).toBeLessThan(0.01)
      })

      it('should include account-level data with correct columns', () => {
        const acct1930 = balans.find(r => r.account_number === 1930)
        expect(acct1930).toBeDefined()
        expect(acct1930!.utg_balans).toBeCloseTo(1262367.31, 1)
        expect(acct1930!.ing_balans).toBeCloseTo(568640.31, 1)
        expect(acct1930!.period).toBeCloseTo(1262367.31 - 568640.31, 1)
      })
    })

    describe('Resultatrapport', () => {
      it('SUMMA RORELSENS INTAKTER should be 1 134 896,27', () => {
        const sum = resultat
          .filter(r => r.account_number >= 3000 && r.account_number < 4000)
          .reduce((s, r) => s + r.period, 0)
        expect(Math.abs(sum - 1134896.27)).toBeLessThan(0.01)
      })

      it('BERAKNAT RESULTAT should be 869 954,78', () => {
        const sum = resultat.reduce((s, r) => s + r.period, 0)
        expect(Math.abs(sum - 869954.78)).toBeLessThan(0.01)
      })

      it('period and ackumulerat should match for annual reports', () => {
        for (const r of resultat) {
          expect(r.period).toBe(r.ackumulerat)
        }
      })
    })
  })

  // ─────────────────────────────────────────────────────
  // Skata Sweden AB
  // ─────────────────────────────────────────────────────
  describe('Skata Sweden AB', () => {
    let balans: BalansRow[]
    let resultat: ResultatRow[]

    beforeAll(async () => {
      await truncateAll(client)
      await importFile('SIE/SkataSwedenAB20260330_170222.se')
      const fyId = await getFyId()
      balans = await getBalansrapport(fyId)
      resultat = await getResultatrapport(fyId)
    })

    describe('Balansrapport', () => {
      it('SUMMA TILLGANGAR should be 430 607,53', () => {
        const sum = balans
          .filter(r => r.account_number >= 1000 && r.account_number < 2000)
          .reduce((s, r) => s + r.utg_balans, 0)
        expect(Math.abs(sum - 430607.53)).toBeLessThan(0.01)
      })

      it('BERAKNAT RESULTAT should be 58 795,82', () => {
        const sum = balans.reduce((s, r) => s + r.utg_balans, 0)
        expect(Math.abs(sum - 58795.82)).toBeLessThan(0.01)
      })
    })

    describe('Resultatrapport', () => {
      it('SUMMA RORELSENS INTAKTER should be 96 611,97', () => {
        const sum = resultat
          .filter(r => r.account_number >= 3000 && r.account_number < 4000)
          .reduce((s, r) => s + r.period, 0)
        expect(Math.abs(sum - 96611.97)).toBeLessThan(0.01)
      })

      it('BERAKNAT RESULTAT should be 58 795,82', () => {
        const sum = resultat.reduce((s, r) => s + r.period, 0)
        expect(Math.abs(sum - 58795.82)).toBeLessThan(0.01)
      })
    })
  })

  // ─────────────────────────────────────────────────────
  // Byggnadsställningsentreprenad i Stockholm AB
  // ─────────────────────────────────────────────────────
  describe('Byggnadsställningsentreprenad i Stockholm AB', () => {
    let balans: BalansRow[]
    let resultat: ResultatRow[]

    beforeAll(async () => {
      await truncateAll(client)
      await importFile('SIE/ByggnadsställningsentreprenadiStockholmAB20260330_170428.se')
      const fyId = await getFyId()
      balans = await getBalansrapport(fyId)
      resultat = await getResultatrapport(fyId)
    })

    describe('Balansrapport', () => {
      it('SUMMA TILLGANGAR should be 20 646 658,73', () => {
        const sum = balans
          .filter(r => r.account_number >= 1000 && r.account_number < 2000)
          .reduce((s, r) => s + r.utg_balans, 0)
        expect(Math.abs(sum - 20646658.73)).toBeLessThan(0.02)
      })

      it('BERAKNAT RESULTAT should be 2 886 185,09', () => {
        const sum = balans.reduce((s, r) => s + r.utg_balans, 0)
        expect(Math.abs(sum - 2886185.09)).toBeLessThan(0.02)
      })
    })

    describe('Resultatrapport', () => {
      it('SUMMA RORELSENS INTAKTER should be 37 486 819,37', () => {
        const sum = resultat
          .filter(r => r.account_number >= 3000 && r.account_number < 4000)
          .reduce((s, r) => s + r.period, 0)
        expect(Math.abs(sum - 37486819.37)).toBeLessThan(0.02)
      })

      it('BERAKNAT RESULTAT should be 2 886 185,09', () => {
        const sum = resultat.reduce((s, r) => s + r.period, 0)
        expect(Math.abs(sum - 2886185.09)).toBeLessThan(0.02)
      })
    })
  })
})
