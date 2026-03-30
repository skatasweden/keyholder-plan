import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { queryKeys } from '@/lib/query-keys'
import { parseNumeric } from '@/lib/format'

export interface ResultatRow {
  account_number: number
  account_name: string
  period: number
  ackumulerat: number
  period_fg_ar: number
}

export function useResultatrapport(fyId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.reports.resultat(fyId!),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('report_resultatrapport', {
        p_financial_year_id: fyId!,
      })
      if (error) throw error
      return (data ?? []).map((r: Record<string, unknown>) => ({
        account_number: r.account_number as number,
        account_name: r.account_name as string,
        period: parseNumeric(r.period),
        ackumulerat: parseNumeric(r.ackumulerat),
        period_fg_ar: parseNumeric(r.period_fg_ar),
      })) as ResultatRow[]
    },
    enabled: !!fyId,
  })
}
