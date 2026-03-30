import type { SupabaseClient } from '@supabase/supabase-js'
import type { ParsedSIE4, ValidationReport } from './types.js'

export async function validateImport(
  parsed: ParsedSIE4,
  client: SupabaseClient
): Promise<ValidationReport> {
  const checks: ValidationReport['checks'] = []

  // 1. Account count
  const { count: dbAccountCount } = await client
    .from('accounts')
    .select('*', { count: 'exact', head: true })
  checks.push({
    name: 'Account count',
    status: (dbAccountCount ?? 0) >= parsed.accounts.length ? 'pass' : 'fail',
    expected: `>= ${parsed.accounts.length}`,
    actual: dbAccountCount ?? 0,
  })

  // 2. Voucher count per series
  const parsedBySeries = new Map<string, number>()
  for (const v of parsed.vouchers) {
    parsedBySeries.set(v.series, (parsedBySeries.get(v.series) || 0) + 1)
  }
  const dbVouchers = await fetchAll(client, 'vouchers', 'series')
  const dbBySeries = new Map<string, number>()
  for (const v of dbVouchers) {
    dbBySeries.set(v.series, (dbBySeries.get(v.series) || 0) + 1)
  }
  for (const [series, count] of parsedBySeries) {
    const dbCount = dbBySeries.get(series) || 0
    checks.push({
      name: `Voucher count (${series})`,
      status: dbCount === count ? 'pass' : 'fail',
      expected: count,
      actual: dbCount,
    })
  }

  // 3. Voucher row count
  const totalParsedRows = parsed.vouchers.reduce((s, v) => s + v.rows.length, 0)
  const { count: dbRowCount } = await client
    .from('voucher_rows')
    .select('*', { count: 'exact', head: true })
  checks.push({
    name: 'Voucher row count',
    status: dbRowCount === totalParsedRows ? 'pass' : 'fail',
    expected: totalParsedRows,
    actual: dbRowCount ?? 0,
  })

  // Look up financial_year_id for year_index 0
  const { data: fyData } = await client
    .from('financial_years')
    .select('id')
    .eq('year_index', 0)
    .single()
  const currentFyId = fyData?.id

  // 4. Opening balance amounts (current year only)
  const { data: dbIB } = await client
    .from('opening_balances')
    .select('account_number, amount')
    .eq('financial_year_id', currentFyId)
  const dbIBMap = new Map<number, number>()
  for (const row of dbIB || []) {
    dbIBMap.set(row.account_number, parseFloat(row.amount))
  }
  let ibMatch = true
  let ibChecked = 0
  for (const ib of parsed.opening_balances) {
    if (ib.year_index !== 0) continue // Only check current year
    ibChecked++
    const dbAmount = dbIBMap.get(ib.account_number)
    if (dbAmount === undefined || Math.abs(dbAmount - ib.amount) > 0.005) {
      ibMatch = false
    }
  }
  checks.push({
    name: 'Opening balances match',
    status: ibMatch ? 'pass' : 'fail',
    expected: `${ibChecked} accounts`,
    actual: ibMatch ? `${ibChecked} accounts` : 'mismatch',
    details: ibMatch ? `${ibChecked} accounts checked` : undefined,
  })

  // 5. Closing balance amounts (current year only)
  const { data: dbUB } = await client
    .from('closing_balances')
    .select('account_number, amount')
    .eq('financial_year_id', currentFyId)
  const dbUBMap = new Map<number, number>()
  for (const row of dbUB || []) {
    dbUBMap.set(row.account_number, parseFloat(row.amount))
  }
  let ubMatch = true
  let ubChecked = 0
  for (const ub of parsed.closing_balances) {
    if (ub.year_index !== 0) continue
    ubChecked++
    const dbAmount = dbUBMap.get(ub.account_number)
    if (dbAmount === undefined || Math.abs(dbAmount - ub.amount) > 0.005) {
      ubMatch = false
    }
  }
  checks.push({
    name: 'Closing balances match',
    status: ubMatch ? 'pass' : 'fail',
    expected: `${ubChecked} accounts`,
    actual: ubMatch ? `${ubChecked} accounts` : 'mismatch',
    details: ubMatch ? `${ubChecked} accounts checked` : undefined,
  })

  // 6. Voucher balance — only TRANS rows count (BTRANS/RTRANS are supplementary)
  const dbVoucherRows = await fetchAll(client, 'voucher_rows', 'voucher_id, amount', { transaction_type: 'normal' })
  const voucherSums = new Map<string, number>()
  for (const row of dbVoucherRows || []) {
    const current = voucherSums.get(row.voucher_id) || 0
    voucherSums.set(row.voucher_id, current + parseFloat(row.amount))
  }
  let unbalancedCount = 0
  for (const [, sum] of voucherSums) {
    if (Math.abs(sum) > 0.005) unbalancedCount++
  }
  const totalVouchers = voucherSums.size
  checks.push({
    name: 'Voucher balance (debit = credit)',
    status: unbalancedCount === 0 ? 'pass' : 'fail',
    expected: `${totalVouchers} balanced`,
    actual: unbalancedCount === 0 ? `${totalVouchers} balanced` : `${unbalancedCount} unbalanced`,
  })

  // Print report
  console.log('\nValidation Report')
  console.log('─────────────────')
  for (const check of checks) {
    const icon = check.status === 'pass' ? '✓' : '✗'
    const detail = check.details ? ` (${check.details})` : ''
    console.log(`${icon} ${check.name}: ${check.expected} parsed, ${check.actual} in DB${detail}`)
  }
  const passCount = checks.filter(c => c.status === 'pass').length
  console.log(`\nResult: ${passCount}/${checks.length} checks passed`)

  return {
    passed: checks.every(c => c.status === 'pass'),
    checks,
  }
}

async function fetchAll(
  client: SupabaseClient,
  table: string,
  columns: string,
  filters: Record<string, string> = {}
): Promise<Record<string, unknown>[]> {
  const PAGE = 1000
  const all: Record<string, unknown>[] = []
  let offset = 0
  while (true) {
    let query = client.from(table).select(columns).range(offset, offset + PAGE - 1)
    for (const [k, v] of Object.entries(filters)) {
      query = query.eq(k, v)
    }
    const { data } = await query
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < PAGE) break
    offset += PAGE
  }
  return all
}
