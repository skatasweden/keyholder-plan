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

  // Look up all financial years
  const { data: allFyData } = await client.from('financial_years').select('id, year_index')
  const fyIdToIndex = new Map<string, number>()
  for (const fy of allFyData || []) {
    fyIdToIndex.set(fy.id, fy.year_index)
  }
  const currentFyId = (allFyData || []).find(fy => fy.year_index === 0)?.id

  // 4. Opening balance amounts (current year, aggregate only)
  const { data: dbIB } = await client
    .from('opening_balances')
    .select('account_number, amount, dimension_number')
    .eq('financial_year_id', currentFyId)
  const dbIBMap = new Map<number, number>()
  for (const row of dbIB || []) {
    // Only check aggregate balances (no dimension) for backward compat
    if (row.dimension_number === null) {
      dbIBMap.set(row.account_number, parseFloat(row.amount))
    }
  }
  let ibMatch = true
  let ibChecked = 0
  for (const ib of parsed.opening_balances) {
    if (ib.year_index !== 0 || ib.dimension_number !== null) continue
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

  // 5. Closing balance amounts (current year, aggregate only)
  const { data: dbUB } = await client
    .from('closing_balances')
    .select('account_number, amount, dimension_number')
    .eq('financial_year_id', currentFyId)
  const dbUBMap = new Map<number, number>()
  for (const row of dbUB || []) {
    if (row.dimension_number === null) {
      dbUBMap.set(row.account_number, parseFloat(row.amount))
    }
  }
  let ubMatch = true
  let ubChecked = 0
  for (const ub of parsed.closing_balances) {
    if (ub.year_index !== 0 || ub.dimension_number !== null) continue
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

  // 7. Period results (RES) amounts
  const dbRES = await fetchAll(client, 'period_results', 'account_number, amount, financial_year_id')
  const dbRESMap = new Map<string, number>()
  for (const row of dbRES) {
    const yi = fyIdToIndex.get(row.financial_year_id as string)
    dbRESMap.set(`${yi}:${row.account_number}`, parseFloat(row.amount as string))
  }
  let resMatch = true
  let resChecked = 0
  for (const r of parsed.period_results) {
    resChecked++
    const dbAmount = dbRESMap.get(`${r.year_index}:${r.account_number}`)
    if (dbAmount === undefined || Math.abs(dbAmount - r.amount) > 0.005) {
      resMatch = false
    }
  }
  checks.push({
    name: 'Period results (RES) match',
    status: resMatch ? 'pass' : 'fail',
    expected: `${resChecked} accounts`,
    actual: resMatch ? `${resChecked} accounts` : 'mismatch',
  })

  // 8. Period balances (PSALDO) — includes dimension-tagged entries
  const dbPSALDO = await fetchAll(client, 'period_balances', 'account_number, period, amount, financial_year_id, dimension_number, object_number')
  const dbPSMap = new Map<string, number>()
  for (const row of dbPSALDO) {
    const yi = fyIdToIndex.get(row.financial_year_id as string)
    const key = `${yi}:${row.period}:${row.account_number}:${row.dimension_number ?? ''}:${row.object_number ?? ''}`
    dbPSMap.set(key, parseFloat(row.amount as string))
  }
  let psMatch = true
  let psChecked = 0
  for (const p of parsed.period_balances) {
    psChecked++
    const key = `${p.year_index}:${p.period}:${p.account_number}:${p.dimension_number ?? ''}:${p.object_number ?? ''}`
    const dbAmount = dbPSMap.get(key)
    if (dbAmount === undefined || Math.abs(dbAmount - p.amount) > 0.005) {
      psMatch = false
    }
  }
  checks.push({
    name: 'Period balances (PSALDO) match',
    status: psMatch ? 'pass' : 'fail',
    expected: `${psChecked} entries`,
    actual: psMatch ? `${psChecked} entries` : 'mismatch',
  })

  // 9. Object count
  const { count: dbObjectCount } = await client
    .from('objects')
    .select('*', { count: 'exact', head: true })
  checks.push({
    name: 'Object count',
    status: (dbObjectCount ?? 0) === parsed.objects.length ? 'pass' : 'fail',
    expected: parsed.objects.length,
    actual: dbObjectCount ?? 0,
  })

  // 10. BTRANS/RTRANS type flags
  const parsedBtrans = parsed.vouchers.reduce(
    (sum, v) => sum + v.rows.filter(r => r.type === 'btrans').length, 0
  )
  const parsedRtrans = parsed.vouchers.reduce(
    (sum, v) => sum + v.rows.filter(r => r.type === 'rtrans').length, 0
  )
  const { count: dbBtrans } = await client
    .from('voucher_rows')
    .select('*', { count: 'exact', head: true })
    .eq('transaction_type', 'btrans')
  const { count: dbRtrans } = await client
    .from('voucher_rows')
    .select('*', { count: 'exact', head: true })
    .eq('transaction_type', 'rtrans')
  const typeMatch = (dbBtrans ?? 0) === parsedBtrans && (dbRtrans ?? 0) === parsedRtrans
  checks.push({
    name: 'BTRANS/RTRANS type flags',
    status: typeMatch ? 'pass' : 'fail',
    expected: `${parsedBtrans} btrans, ${parsedRtrans} rtrans`,
    actual: `${dbBtrans ?? 0} btrans, ${dbRtrans ?? 0} rtrans`,
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
