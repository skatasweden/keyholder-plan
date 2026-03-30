import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { parseSIE4 } from '../sie4-parser.js'
import { importToSupabase } from '../sie4-importer.js'
import { validateImport } from '../sie4-validator.js'
import { createTestSIE4Buffer } from './test-fixture.js'

const SUPABASE_URL = process.env.SUPABASE_URL || 'http://127.0.0.1:54421'
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || ''

// Check if Supabase is running before all tests
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
  // Delete in reverse FK order
  const tables = [
    'voucher_rows', 'vouchers', 'period_balances', 'period_results',
    'closing_balances', 'opening_balances', 'sru_codes', 'accounts',
    'objects', 'dimensions', 'financial_years', 'company_info',
  ]
  for (const table of tables) {
    await c.from(table).delete().not('id', 'is', null)
  }
}

describe.skipIf(!supabaseAvailable)('Integration: full pipeline', () => {
  beforeEach(async () => {
    await truncateAll(client)
  })

  it('should import test fixture and pass all validation checks', async () => {
    const parsed = parseSIE4(createTestSIE4Buffer())
    const result = await importToSupabase(parsed, client)

    expect(result.success).toBe(true)
    expect(result.import_errors).toHaveLength(0)
    expect(result.stats.accounts).toBe(5)
    expect(result.stats.vouchers).toBe(4)
    expect(result.stats.voucher_rows).toBe(11)

    const report = await validateImport(parsed, client)
    expect(report.passed).toBe(true)
    for (const check of report.checks) {
      expect(check.status, `Check "${check.name}" failed`).toBe('pass')
    }
  })

  it('should be idempotent (re-import produces same result)', async () => {
    const parsed = parseSIE4(createTestSIE4Buffer())

    // Import twice
    await importToSupabase(parsed, client)
    const result2 = await importToSupabase(parsed, client)

    expect(result2.success).toBe(true)
    expect(result2.stats.accounts).toBe(5)
    expect(result2.stats.vouchers).toBe(4)
    expect(result2.stats.voucher_rows).toBe(11)

    const report = await validateImport(parsed, client)
    expect(report.passed).toBe(true)
  })

  it('should populate account_type column from #KTYP', async () => {
    const parsed = parseSIE4(createTestSIE4Buffer())
    await importToSupabase(parsed, client)

    const { data } = await client
      .from('accounts')
      .select('account_number, account_type')
      .order('account_number')

    const typeMap = new Map(data?.map(a => [a.account_number, a.account_type]))
    expect(typeMap.get(1510)).toBe('T')
    expect(typeMap.get(1930)).toBe('T')
    expect(typeMap.get(2640)).toBe('S')
    expect(typeMap.get(3001)).toBe('I')
    expect(typeMap.get(5420)).toBe('K')
  })

  it('should import RevIL AB (small) — all checks pass', async () => {
    const buffer = readFileSync(resolve('SIE/RevILAB20260330_165333.se'))
    const parsed = parseSIE4(buffer)
    const result = await importToSupabase(parsed, client)

    expect(result.success).toBe(true)
    expect(result.stats.vouchers).toBe(406)

    const report = await validateImport(parsed, client)
    expect(report.passed).toBe(true)
  })

  it('should import Skata Sweden AB (medium) — all checks pass', async () => {
    const buffer = readFileSync(resolve('SIE/SkataSwedenAB20260330_170222.se'))
    const parsed = parseSIE4(buffer)
    const result = await importToSupabase(parsed, client)

    expect(result.success).toBe(true)
    expect(result.stats.vouchers).toBe(66)

    const report = await validateImport(parsed, client)
    expect(report.passed).toBe(true)
  })

  it('should import Byggnadsställningsentreprenad (large) — all checks pass', async () => {
    const buffer = readFileSync(resolve(
      'SIE/ByggnadsställningsentreprenadiStockholmAB20260330_170428.se'
    ))
    const parsed = parseSIE4(buffer)
    const result = await importToSupabase(parsed, client)

    expect(result.success).toBe(true)
    expect(result.stats.vouchers).toBe(4434)

    const report = await validateImport(parsed, client)
    expect(report.passed).toBe(true)
  })
})
