/**
 * Fortnox Crosscheck Tests
 *
 * These tests prove parser-to-SOURCE accuracy by comparing DB values against
 * hardcoded numbers from real Fortnox Balansrapport and Resultatrapport PDFs.
 *
 * Source PDFs: SIE/FORTNOX-CORRECT-DATA/
 *
 * SIGN CONVENTION:
 * - Balansrapport (IB/UB): DB values match Fortnox directly
 * - Resultatrapport (RES): Fortnox negates all amounts for display
 *   (income=positive, costs=negative). Our DB stores raw SIE values
 *   (debit=positive, credit=negative). So: DB value = -1 × Fortnox value
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { parseSIE4 } from '../sie4-parser.js'
import { importToSupabase } from '../sie4-importer.js'

const SUPABASE_URL = process.env.SUPABASE_URL || 'http://127.0.0.1:54421'
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || '$SUPABASE_SERVICE_KEY'

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

async function getFyId(): Promise<string> {
  const { data } = await client.from('financial_years').select('id').eq('year_index', 0).single()
  return data!.id
}

describe.skipIf(!supabaseAvailable)('Fortnox Crosscheck', () => {

  // ─────────────────────────────────────────────────────
  // RevIL AB — Balansrapport + Resultatrapport
  // ─────────────────────────────────────────────────────
  describe('RevIL AB', () => {
    let fyId: string
    let ub: Map<number, number>
    let ib: Map<number, number>
    let res: Map<number, number>

    beforeAll(async () => {
      await truncateAll(client)
      await importFile('SIE/RevILAB20260330_165333.se')
      fyId = await getFyId()
      ub = await getUB(fyId)
      ib = await getIB(fyId)
      res = await getRES(fyId)
    })

    describe('Balansrapport — Utg balans (closing balances)', () => {
      // Values from: FORTNOX-CORRECT-DATA/REVIL-Balans-Resultat-Rapport/RevILAB...pdf
      const expected: [number, number][] = [
        // TILLGÅNGAR
        [1210, 54500.00],
        [1221, 83860.39],
        [1229, -61060.39],
        [1350, 188596.00],
        [1386, 53305.96],
        [1510, 311269.00],
        [1630, -15.00],
        [1660, 265136.00],
        [1790, 1794231.20],
        [1930, 1262367.31],
        // EGET KAPITAL OCH SKULDER
        [2081, -100000.00],
        [2091, -937552.85],
        [2099, -351594.90],
        [2118, -500000.00],
        [2119, -200000.00],
        [2120, -250000.00],
        [2123, -110000.00],
        [2124, -130000.00],
        [2440, -170785.65],
        [2510, -9675.00],
        [2611, -237174.58],
        [2641, 51790.82],
        [2650, -0.40],
        [2840, -872500.00],
        [2850, -209936.67],
        [2893, 886138.05],
        [2999, 62063.63],
      ]

      it('should match all closing balance accounts', () => {
        for (const [account, fortnoxValue] of expected) {
          const dbValue = ub.get(account)
          expect(dbValue, `UB account ${account}`).toBeDefined()
          expect(Math.abs(dbValue! - fortnoxValue), `UB account ${account}: DB=${dbValue} Fortnox=${fortnoxValue}`).toBeLessThan(0.01)
        }
      })

      it('SUMMA TILLGÅNGAR should be 3 952 190,47', () => {
        let sum = 0
        for (const [acc, amt] of ub) {
          if (acc >= 1000 && acc < 2000) sum += amt
        }
        expect(Math.abs(sum - 3952190.47)).toBeLessThan(0.01)
      })

      it('BERÄKNAT RESULTAT should be 869 954,78', () => {
        let assets = 0, liabilitiesEquity = 0
        for (const [acc, amt] of ub) {
          if (acc >= 1000 && acc < 2000) assets += amt
          if (acc >= 2000 && acc < 3000) liabilitiesEquity += amt
        }
        const result = assets + liabilitiesEquity
        expect(Math.abs(result - 869954.78)).toBeLessThan(0.01)
      })
    })

    describe('Balansrapport — Ing balans (opening balances)', () => {
      it('should match key opening balances', () => {
        const expected: [number, number][] = [
          [1510, 1043895.00],
          [1930, 568640.31],
          [2081, -100000.00],
          [2840, -872500.00],
        ]
        for (const [account, fortnoxValue] of expected) {
          const dbValue = ib.get(account)
          expect(dbValue, `IB account ${account}`).toBeDefined()
          expect(Math.abs(dbValue! - fortnoxValue), `IB account ${account}`).toBeLessThan(0.01)
        }
      })
    })

    describe('Resultatrapport — Period (= -1 × DB RES)', () => {
      // Values from Fortnox Resultatrapport Period column
      // DB stores SIE convention, Fortnox negates for display
      const expected: [number, number][] = [
        [3041, 842640.00],
        [3051, 292255.30],
        [3740, 0.97],
        [5420, -4717.25],
        [5615, -100047.40],
        [6430, -67893.00],
        [6550, -37595.25],
        [8300, 39714.00],
        [8423, -8371.00],
      ]

      it('should match all RES accounts (sign-inverted)', () => {
        for (const [account, fortnoxValue] of expected) {
          const dbValue = res.get(account)
          expect(dbValue, `RES account ${account}`).toBeDefined()
          // Fortnox = -1 × DB, so DB = -fortnoxValue
          expect(Math.abs(dbValue! - (-fortnoxValue)), `RES account ${account}: DB=${dbValue} expected=${-fortnoxValue}`).toBeLessThan(0.01)
        }
      })

      it('BERÄKNAT RESULTAT should be 869 954,78', () => {
        let sum = 0
        for (const [, amt] of res) {
          sum += amt // raw SIE values
        }
        // In Fortnox: BERÄKNAT RESULTAT = 869954.78 (positive)
        // In DB: sum of all RES = -869954.78 (credit convention)
        expect(Math.abs((-sum) - 869954.78)).toBeLessThan(0.01)
      })
    })
  })

  // ─────────────────────────────────────────────────────
  // Skata Sweden AB — Balansrapport + Resultatrapport
  // ─────────────────────────────────────────────────────
  describe('Skata Sweden AB', () => {
    let fyId: string
    let ub: Map<number, number>
    let res: Map<number, number>

    beforeAll(async () => {
      await truncateAll(client)
      await importFile('SIE/SkataSwedenAB20260330_170222.se')
      fyId = await getFyId()
      ub = await getUB(fyId)
      res = await getRES(fyId)
    })

    describe('Balansrapport — Utg balans', () => {
      it('SUMMA TILLGÅNGAR should be 430 607,53', () => {
        let sum = 0
        for (const [acc, amt] of ub) {
          if (acc >= 1000 && acc < 2000) sum += amt
        }
        expect(Math.abs(sum - 430607.53)).toBeLessThan(0.01)
      })

      it('should match key closing balances', () => {
        const expected: [number, number][] = [
          [1210, 5182.00],
          [1220, 272502.80],
          [1510, 171759.10],
          [1930, -9173.33],
          [2081, -50000.00],
          [2840, -178240.99],
          [2999, 69941.99],
        ]
        for (const [account, fortnoxValue] of expected) {
          const dbValue = ub.get(account)
          expect(dbValue, `UB account ${account}`).toBeDefined()
          expect(Math.abs(dbValue! - fortnoxValue), `UB ${account}: DB=${dbValue} Fortnox=${fortnoxValue}`).toBeLessThan(0.01)
        }
      })

      it('BERÄKNAT RESULTAT should be 58 795,82', () => {
        let assets = 0, liabilitiesEquity = 0
        for (const [acc, amt] of ub) {
          if (acc >= 1000 && acc < 2000) assets += amt
          if (acc >= 2000 && acc < 3000) liabilitiesEquity += amt
        }
        expect(Math.abs((assets + liabilitiesEquity) - 58795.82)).toBeLessThan(0.01)
      })
    })

    describe('Resultatrapport — Period', () => {
      it('should match key RES accounts', () => {
        const expected: [number, number][] = [
          [3001, 78500.00],
          [3308, 18111.97],
          [4600, -15061.85],
          [5420, -1975.20],
          [8423, -435.00],
        ]
        for (const [account, fortnoxValue] of expected) {
          const dbValue = res.get(account)
          expect(dbValue, `RES account ${account}`).toBeDefined()
          expect(Math.abs(dbValue! - (-fortnoxValue)), `RES ${account}: DB=${dbValue} expected=${-fortnoxValue}`).toBeLessThan(0.01)
        }
      })

      it('BERÄKNAT RESULTAT should be 58 795,82', () => {
        let sum = 0
        for (const [, amt] of res) sum += amt
        expect(Math.abs((-sum) - 58795.82)).toBeLessThan(0.01)
      })
    })
  })

  // ─────────────────────────────────────────────────────
  // Byggnadsställningsentreprenad i Stockholm AB
  // ─────────────────────────────────────────────────────
  describe('Byggnadsställningsentreprenad i Stockholm AB', () => {
    let fyId: string
    let ub: Map<number, number>
    let res: Map<number, number>

    beforeAll(async () => {
      await truncateAll(client)
      await importFile('SIE/ByggnadsställningsentreprenadiStockholmAB20260330_170428.se')
      fyId = await getFyId()
      ub = await getUB(fyId)
      res = await getRES(fyId)
    })

    describe('Balansrapport — Utg balans', () => {
      it('SUMMA TILLGÅNGAR should be 20 646 658,73', () => {
        let sum = 0
        for (const [acc, amt] of ub) {
          if (acc >= 1000 && acc < 2000) sum += amt
        }
        expect(Math.abs(sum - 20646658.73)).toBeLessThan(0.02)
      })

      it('should match key closing balances', () => {
        const expected: [number, number][] = [
          [1110, 1279565.00],
          [1130, 2681935.00],
          [1510, 8848471.00],
          [1930, -1582373.95],
          [2081, -100000.00],
          [2350, 0.00],
          [2352, -2128000.00],
          [2440, -7625949.47],
        ]
        for (const [account, fortnoxValue] of expected) {
          const dbValue = ub.get(account)
          expect(dbValue, `UB account ${account}`).toBeDefined()
          expect(Math.abs(dbValue! - fortnoxValue), `UB ${account}: DB=${dbValue} Fortnox=${fortnoxValue}`).toBeLessThan(0.01)
        }
      })

      it('BERÄKNAT RESULTAT should be 2 886 185,09', () => {
        let assets = 0, liabilitiesEquity = 0
        for (const [acc, amt] of ub) {
          if (acc >= 1000 && acc < 2000) assets += amt
          if (acc >= 2000 && acc < 3000) liabilitiesEquity += amt
        }
        expect(Math.abs((assets + liabilitiesEquity) - 2886185.09)).toBeLessThan(0.02)
      })
    })

    describe('Resultatrapport — Period', () => {
      it('should match key RES accounts', () => {
        const expected: [number, number][] = [
          [3001, 27774010.30],
          [3010, 6974466.00],
          [4010, -54020.71],
          [4011, -2238124.92],
          [5010, -1073250.00],
          [6550, -554752.00],
          [8910, 183885.00],
        ]
        for (const [account, fortnoxValue] of expected) {
          const dbValue = res.get(account)
          expect(dbValue, `RES account ${account}`).toBeDefined()
          expect(Math.abs(dbValue! - (-fortnoxValue)), `RES ${account}: DB=${dbValue} expected=${-fortnoxValue}`).toBeLessThan(0.01)
        }
      })

      it('BERÄKNAT RESULTAT should be 2 886 185,09', () => {
        let sum = 0
        for (const [, amt] of res) sum += amt
        expect(Math.abs((-sum) - 2886185.09)).toBeLessThan(0.02)
      })
    })
  })
})
