import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { queryKeys } from '@/lib/query-keys'

export interface ValidationCheck {
  name: string
  status: 'pass' | 'fail'
  expected: string | number
  actual: string | number
}

export interface ValidationResult {
  passed: boolean
  checks: ValidationCheck[]
}

export function useValidation(companyId: string | undefined, fyId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.validation.checks(companyId!, fyId!),
    queryFn: async (): Promise<ValidationResult> => {
      const checks: ValidationCheck[] = []

      // 1. Account count
      const { count: accountCount } = await supabase
        .from('accounts')
        .select('*', { count: 'exact', head: true })
        .eq('company_id', companyId!)
      checks.push({
        name: 'Konton importerade',
        status: (accountCount ?? 0) > 0 ? 'pass' : 'fail',
        expected: '> 0',
        actual: accountCount ?? 0,
      })

      // 2. Voucher count
      const { count: voucherCount } = await supabase
        .from('vouchers')
        .select('*', { count: 'exact', head: true })
        .eq('company_id', companyId!)
      checks.push({
        name: 'Verifikationer importerade',
        status: (voucherCount ?? 0) > 0 ? 'pass' : 'fail',
        expected: '> 0',
        actual: voucherCount ?? 0,
      })

      // 3. Voucher row count
      const { data: voucherIds } = await supabase
        .from('vouchers')
        .select('id')
        .eq('company_id', companyId!)
      const ids = (voucherIds ?? []).map(v => v.id)
      let rowCount = 0
      if (ids.length > 0) {
        // Count in batches to avoid query length limits
        const BATCH = 50
        for (let i = 0; i < ids.length; i += BATCH) {
          const batch = ids.slice(i, i + BATCH)
          const { count } = await supabase
            .from('voucher_rows')
            .select('*', { count: 'exact', head: true })
            .in('voucher_id', batch)
          rowCount += count ?? 0
        }
      }
      checks.push({
        name: 'Verifikationsrader',
        status: rowCount > 0 ? 'pass' : 'fail',
        expected: '> 0',
        actual: rowCount,
      })

      // 4. Opening balances exist
      const { count: ibCount } = await supabase
        .from('opening_balances')
        .select('*', { count: 'exact', head: true })
        .eq('financial_year_id', fyId!)
        .is('dimension_number', null)
      checks.push({
        name: 'Ingaende balanser',
        status: (ibCount ?? 0) > 0 ? 'pass' : 'fail',
        expected: '> 0',
        actual: ibCount ?? 0,
      })

      // 5. Closing balances exist
      const { count: ubCount } = await supabase
        .from('closing_balances')
        .select('*', { count: 'exact', head: true })
        .eq('financial_year_id', fyId!)
        .is('dimension_number', null)
      checks.push({
        name: 'Utgaende balanser',
        status: (ubCount ?? 0) > 0 ? 'pass' : 'fail',
        expected: '> 0',
        actual: ubCount ?? 0,
      })

      // 6. Voucher balance (debit = credit) — check a sample
      const { data: sampleVouchers } = await supabase
        .from('vouchers')
        .select('id')
        .eq('financial_year_id', fyId!)
        .limit(100)
      let unbalanced = 0
      if (sampleVouchers && sampleVouchers.length > 0) {
        const sampleIds = sampleVouchers.map(v => v.id)
        const { data: sampleRows } = await supabase
          .from('voucher_rows')
          .select('voucher_id, amount')
          .in('voucher_id', sampleIds)
          .eq('transaction_type', 'normal')
        const sums = new Map<string, number>()
        for (const r of sampleRows ?? []) {
          sums.set(r.voucher_id, (sums.get(r.voucher_id) ?? 0) + parseFloat(r.amount))
        }
        for (const [, sum] of sums) {
          if (Math.abs(sum) > 0.005) unbalanced++
        }
      }
      checks.push({
        name: 'Verifikationer balanserar',
        status: unbalanced === 0 ? 'pass' : 'fail',
        expected: '0 obalanserade',
        actual: unbalanced === 0 ? `${sampleVouchers?.length ?? 0} balanserar` : `${unbalanced} obalanserade`,
      })

      // 7. Period results exist
      const { count: resCount } = await supabase
        .from('period_results')
        .select('*', { count: 'exact', head: true })
        .eq('financial_year_id', fyId!)
      checks.push({
        name: 'Periodens resultat (RES)',
        status: (resCount ?? 0) > 0 ? 'pass' : 'fail',
        expected: '> 0',
        actual: resCount ?? 0,
      })

      // 8. Period balances exist
      const { count: pbCount } = await supabase
        .from('period_balances')
        .select('*', { count: 'exact', head: true })
        .eq('financial_year_id', fyId!)
      checks.push({
        name: 'Periodsaldon (PSALDO)',
        status: (pbCount ?? 0) >= 0 ? 'pass' : 'fail',
        expected: '>= 0',
        actual: pbCount ?? 0,
      })

      // 9. Object count
      const { count: objCount } = await supabase
        .from('objects')
        .select('*', { count: 'exact', head: true })
        .eq('company_id', companyId!)
      checks.push({
        name: 'Objekt/kostnadsbarare',
        status: (objCount ?? 0) >= 0 ? 'pass' : 'fail',
        expected: '>= 0',
        actual: objCount ?? 0,
      })

      // 10. Financial years exist
      const { count: fyCount } = await supabase
        .from('financial_years')
        .select('*', { count: 'exact', head: true })
        .eq('company_id', companyId!)
      checks.push({
        name: 'Rakenskapsar',
        status: (fyCount ?? 0) > 0 ? 'pass' : 'fail',
        expected: '> 0',
        actual: fyCount ?? 0,
      })

      return {
        passed: checks.every(c => c.status === 'pass'),
        checks,
      }
    },
    enabled: !!companyId && !!fyId,
  })
}
