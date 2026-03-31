import type { SupabaseClient } from '@supabase/supabase-js'
import type { ParsedSIE4, ImportResult, ImportOptions } from './types'

const BATCH_SIZE = 500

export async function importToSupabase(
  parsed: ParsedSIE4,
  client: SupabaseClient,
  options?: ImportOptions
): Promise<ImportResult> {
  const start = Date.now()
  const stats: ImportResult['stats'] = {
    company_info: 0,
    financial_years: 0,
    dimensions: 0,
    objects: 0,
    accounts: 0,
    sru_codes: 0,
    opening_balances: 0,
    closing_balances: 0,
    period_results: 0,
    period_balances: 0,
    period_budgets: 0,
    vouchers: 0,
    voucher_rows: 0,
    voucher_row_objects: 0,
  }
  const import_errors: ImportResult['import_errors'] = []
  let companyId: string | undefined

  try {
    // 1. company_info (Phase 5: includes optional metadata)
    const { data: companyResult, error: companyErr } = await client
      .from('company_info')
      .upsert({
        fortnox_number: parsed.meta.fortnox_number,
        company_name: parsed.meta.company_name,
        org_number: parsed.meta.org_number || null,
        address_contact: parsed.meta.address.contact,
        address_street: parsed.meta.address.street,
        address_postal: parsed.meta.address.postal,
        address_phone: parsed.meta.address.phone,
        account_plan_type: parsed.meta.account_plan_type,
        balance_date: parsed.meta.balance_date || null,
        sni_code: parsed.meta.sni_code,
        company_type: parsed.meta.company_type,
        comment: parsed.meta.comment,
        tax_year: parsed.meta.tax_year,
        currency: parsed.meta.currency,
      }, { onConflict: 'org_number' })
      .select('id')
    if (companyErr) throw new Error(`company_info: ${companyErr.message}`)
    companyId = options?.companyId ?? companyResult?.[0]?.id
    if (!companyId) throw new Error('Failed to get company_id after upsert')
    stats.company_info = 1
    log('company_info', 1)

    // 2. financial_years
    const fyRows = parsed.financial_years.map(fy => ({
      year_index: fy.year_index,
      start_date: fy.start_date,
      end_date: fy.end_date,
      company_id: companyId,
    }))
    await upsertBatched(client, 'financial_years', fyRows, 'company_id,year_index')
    stats.financial_years = fyRows.length
    log('financial_years', fyRows.length)

    // Build year_index → financial_year_id lookup
    const { data: fyData, error: fyLookupErr } = await client
      .from('financial_years')
      .select('id, year_index')
      .eq('company_id', companyId)
    if (fyLookupErr) throw new Error(`financial_years lookup: ${fyLookupErr.message}`)
    const fyMap = new Map<number, string>()
    for (const fy of fyData || []) {
      fyMap.set(fy.year_index, fy.id)
    }

    // 3. dimensions (Phase 6: includes parent_dimension from #UNDERDIM)
    if (parsed.dimensions.length > 0) {
      const dimRows = parsed.dimensions.map(d => ({
        dimension_number: d.dimension_number,
        name: d.name,
        parent_dimension: d.parent_dimension,
        company_id: companyId,
      }))
      await upsertBatched(client, 'dimensions', dimRows, 'company_id,dimension_number')
      stats.dimensions = dimRows.length
    }
    log('dimensions', stats.dimensions)

    // 4. objects
    if (parsed.objects.length > 0) {
      const objRows = parsed.objects.map(o => ({
        dimension_number: o.dimension_number,
        object_number: o.object_number,
        name: o.name,
        company_id: companyId,
      }))
      await upsertBatched(client, 'objects', objRows, 'company_id,dimension_number,object_number')
      stats.objects = objRows.length
    }
    log('objects', stats.objects)

    // 5. accounts (Phase 5: includes quantity_unit from #ENHET)
    const knownAccounts = new Set(parsed.accounts.map(a => a.account_number))
    const allRefAccounts = [
      ...parsed.opening_balances.map(r => r.account_number),
      ...parsed.closing_balances.map(r => r.account_number),
      ...parsed.period_results.map(r => r.account_number),
      ...parsed.period_balances.map(r => r.account_number),
      ...parsed.period_budgets.map(r => r.account_number),
      ...parsed.vouchers.flatMap(v => v.rows.map(r => r.account_number)),
    ]
    const extraAccounts = [...new Set(allRefAccounts.filter(a => !knownAccounts.has(a)))]
    const accRows = [
      ...parsed.accounts.map(a => ({
        account_number: a.account_number,
        name: a.name,
        account_type: a.account_type,
        quantity_unit: a.quantity_unit,
        company_id: companyId,
      })),
      ...extraAccounts.map(a => ({
        account_number: a,
        name: `Account ${a}`,
        account_type: null,
        quantity_unit: null,
        company_id: companyId,
      })),
    ]
    await upsertBatched(client, 'accounts', accRows, 'company_id,account_number')
    stats.accounts = accRows.length
    log('accounts', accRows.length)

    // 6. sru_codes
    if (parsed.sru_codes.length > 0) {
      const sruRows = parsed.sru_codes.map(s => ({
        account_number: s.account_number,
        sru_code: s.sru_code,
        company_id: companyId,
      }))
      await upsertBatched(client, 'sru_codes', sruRows, 'company_id,account_number')
      stats.sru_codes = sruRows.length
    }
    log('sru_codes', stats.sru_codes)

    // 7. opening_balances (Phase 7: includes #OIB dimension data)
    if (parsed.opening_balances.length > 0) {
      const ibRows = parsed.opening_balances.map(ib => ({
        financial_year_id: fyMap.get(ib.year_index),
        account_number: ib.account_number,
        amount: ib.amount,
        quantity: ib.quantity,
        dimension_number: ib.dimension_number,
        object_number: ib.object_number,
        company_id: companyId,
      }))
      await upsertBatched(client, 'opening_balances', ibRows, 'financial_year_id,account_number,dimension_number,object_number')
      stats.opening_balances = ibRows.length
    }
    log('opening_balances', stats.opening_balances)

    // 8. closing_balances (Phase 7: includes #OUB dimension data)
    if (parsed.closing_balances.length > 0) {
      const ubRows = parsed.closing_balances.map(ub => ({
        financial_year_id: fyMap.get(ub.year_index),
        account_number: ub.account_number,
        amount: ub.amount,
        quantity: ub.quantity,
        dimension_number: ub.dimension_number,
        object_number: ub.object_number,
        company_id: companyId,
      }))
      await upsertBatched(client, 'closing_balances', ubRows, 'financial_year_id,account_number,dimension_number,object_number')
      stats.closing_balances = ubRows.length
    }
    log('closing_balances', stats.closing_balances)

    // 9. period_results
    if (parsed.period_results.length > 0) {
      const resRows = parsed.period_results.map(r => ({
        financial_year_id: fyMap.get(r.year_index),
        account_number: r.account_number,
        amount: r.amount,
        company_id: companyId,
      }))
      await upsertBatched(client, 'period_results', resRows, 'financial_year_id,account_number')
      stats.period_results = resRows.length
    }
    log('period_results', stats.period_results)

    // 10. period_balances (Phase 4: includes PSALDO per-object dimension data)
    if (parsed.period_balances.length > 0) {
      const pbRows = parsed.period_balances.map(pb => ({
        financial_year_id: fyMap.get(pb.year_index),
        account_number: pb.account_number,
        period: pb.period,
        amount: pb.amount,
        quantity: pb.quantity,
        dimension_number: pb.dimension_number,
        object_number: pb.object_number,
        company_id: companyId,
      }))
      await upsertBatched(client, 'period_balances', pbRows, 'financial_year_id,account_number,period,dimension_number,object_number')
      stats.period_balances = pbRows.length
    }
    log('period_balances', stats.period_balances)

    // 11. period_budgets (Phase 8)
    if (parsed.period_budgets.length > 0) {
      const budgetRows = parsed.period_budgets.map(pb => ({
        financial_year_id: fyMap.get(pb.year_index),
        account_number: pb.account_number,
        period: pb.period,
        amount: pb.amount,
        quantity: pb.quantity,
        dimension_number: pb.dimension_number,
        object_number: pb.object_number,
        company_id: companyId,
      }))
      await upsertBatched(client, 'period_budgets', budgetRows, 'financial_year_id,account_number,period,dimension_number,object_number')
      stats.period_budgets = budgetRows.length
    }
    log('period_budgets', stats.period_budgets)

    // 12. vouchers — need to map date to financial year
    const fyRanges = parsed.financial_years.map(fy => ({
      year_index: fy.year_index,
      start: fy.start_date,
      end: fy.end_date,
      id: fyMap.get(fy.year_index)!,
    }))

    const voucherRows = parsed.vouchers.map(v => {
      const fyId = findFinancialYear(v.date, fyRanges)
      return {
        series: v.series,
        voucher_number: v.voucher_number,
        date: v.date,
        description: v.description,
        registration_date: isValidDate(v.registration_date) ? v.registration_date : null,
        financial_year_id: fyId,
        company_id: companyId,
      }
    })
    await upsertBatched(client, 'vouchers', voucherRows, 'series,voucher_number,financial_year_id')
    stats.vouchers = voucherRows.length
    log('vouchers', voucherRows.length)

    // 13. voucher_rows — look up voucher IDs (paginated), delete existing rows, insert fresh
    const voucherMap = new Map<string, string>()
    let vOffset = 0
    const PAGE = 1000
    while (true) {
      const { data: voucherData, error: voucherLookupErr } = await client
        .from('vouchers')
        .select('id, series, voucher_number, financial_year_id')
        .range(vOffset, vOffset + PAGE - 1)
      if (voucherLookupErr) throw new Error(`voucher lookup: ${voucherLookupErr.message}`)
      if (!voucherData || voucherData.length === 0) break
      for (const v of voucherData) {
        voucherMap.set(`${v.series}:${v.voucher_number}:${v.financial_year_id}`, v.id)
      }
      if (voucherData.length < PAGE) break
      vOffset += PAGE
    }

    // Delete all existing voucher_rows for these vouchers (idempotency)
    // CASCADE will also delete voucher_row_objects
    const DELETE_BATCH = 50
    const voucherIds = Array.from(voucherMap.values())
    for (let i = 0; i < voucherIds.length; i += DELETE_BATCH) {
      const batch = voucherIds.slice(i, i + DELETE_BATCH)
      const { error: delErr } = await client
        .from('voucher_rows')
        .delete()
        .in('voucher_id', batch)
      if (delErr) throw new Error(`voucher_rows delete: ${delErr.message}`)
    }

    // Insert fresh voucher rows (Phase 2: includes transaction_date)
    const allVoucherRows: Record<string, unknown>[] = []
    // Track which rows have multi-dim data for Phase 3
    const rowDimensions: Array<Array<{ dim_number: number; object_number: string }>> = []

    for (const v of parsed.vouchers) {
      const fyId = findFinancialYear(v.date, fyRanges)
      const voucherId = voucherMap.get(`${v.series}:${v.voucher_number}:${fyId}`)
      if (!voucherId) continue
      for (const row of v.rows) {
        allVoucherRows.push({
          voucher_id: voucherId,
          account_number: row.account_number,
          dim_number: row.dim_number,
          object_number: row.object_number,
          amount: row.amount,
          description: row.description || null,
          transaction_date: row.transaction_date,
          quantity: row.quantity,
          sign: row.sign,
          transaction_type: row.type,
        })
        rowDimensions.push(row.dimensions)
      }
    }

    // Insert voucher rows in batches, collecting IDs for junction table
    const insertedRowIds: string[] = []
    for (let i = 0; i < allVoucherRows.length; i += BATCH_SIZE) {
      const batch = allVoucherRows.slice(i, i + BATCH_SIZE)
      const { data: inserted, error: insertErr } = await client
        .from('voucher_rows')
        .insert(batch)
        .select('id')
      if (insertErr) throw new Error(`voucher_rows insert: ${insertErr.message}`)
      if (inserted) {
        for (const row of inserted) {
          insertedRowIds.push(row.id)
        }
      }
    }
    stats.voucher_rows = allVoucherRows.length
    log('voucher_rows', allVoucherRows.length)

    // Phase 3: Insert voucher_row_objects junction table entries
    const allObjRows: Record<string, unknown>[] = []
    for (let j = 0; j < insertedRowIds.length; j++) {
      const dims = rowDimensions[j]
      if (dims && dims.length > 0) {
        for (const d of dims) {
          allObjRows.push({
            voucher_row_id: insertedRowIds[j],
            dimension_number: d.dim_number,
            object_number: d.object_number,
          })
        }
      }
    }
    if (allObjRows.length > 0) {
      for (let i = 0; i < allObjRows.length; i += BATCH_SIZE) {
        const batch = allObjRows.slice(i, i + BATCH_SIZE)
        const { error: objErr } = await client.from('voucher_row_objects').insert(batch)
        if (objErr) throw new Error(`voucher_row_objects insert: ${objErr.message}`)
      }
    }
    stats.voucher_row_objects = allObjRows.length
    log('voucher_row_objects', allObjRows.length)

  } catch (err) {
    const errMsg = err instanceof Error ? err.message : JSON.stringify(err)
    import_errors.push({ stage: 'import', error: errMsg })
  }

  return {
    success: import_errors.length === 0,
    companyId,
    stats,
    parse_errors: parsed.parse_errors,
    import_errors,
    duration_ms: Date.now() - start,
  }
}

function isValidDate(d: string | undefined | null): boolean {
  if (!d) return false
  return /^\d{4}-\d{2}-\d{2}$/.test(d)
}

function log(table: string, count: number) {
  console.log(`✓ ${table} (${count.toLocaleString()} row${count !== 1 ? 's' : ''})`)
}

function findFinancialYear(
  date: string,
  fyRanges: Array<{ year_index: number; start: string; end: string; id: string }>
): string | null {
  for (const fy of fyRanges) {
    if (date >= fy.start && date <= fy.end) return fy.id
  }
  return fyRanges[0]?.id || null
}

async function upsertBatched(
  client: SupabaseClient,
  table: string,
  rows: Record<string, unknown>[],
  onConflict: string
) {
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE)
    const { error } = await client.from(table).upsert(batch, { onConflict })
    if (error) throw new Error(`${table}: ${error.message}`)
  }
}
