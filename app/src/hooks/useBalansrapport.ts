import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { queryKeys } from '@/lib/query-keys'
import { parseNumeric } from '@/lib/format'

export interface BalansRow {
  account_number: number
  account_name: string
  ing_balans: number
  period: number
  utg_balans: number
}

export function useBalansrapport(fyId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.reports.balans(fyId!),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('report_balansrapport', {
        p_financial_year_id: fyId!,
      })
      if (error) throw error
      return (data ?? []).map((r: Record<string, unknown>) => ({
        account_number: r.account_number as number,
        account_name: r.account_name as string,
        ing_balans: parseNumeric(r.ing_balans),
        period: parseNumeric(r.period),
        utg_balans: parseNumeric(r.utg_balans),
      })) as BalansRow[]
    },
    enabled: !!fyId,
  })
}
