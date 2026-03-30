import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { queryKeys } from '@/lib/query-keys'

export interface FinancialYear {
  id: string
  year_index: number
  start_date: string
  end_date: string
}

export function useFinancialYears(companyId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.financialYears.byCompany(companyId!),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('financial_years')
        .select('id, year_index, start_date, end_date')
        .eq('company_id', companyId!)
        .order('year_index', { ascending: false })
      if (error) throw error
      return data as FinancialYear[]
    },
    enabled: !!companyId,
  })
}
