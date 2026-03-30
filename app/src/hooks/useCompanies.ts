import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { queryKeys } from '@/lib/query-keys'

export interface Company {
  id: string
  company_name: string
  org_number: string
  account_plan_type: string | null
  currency: string | null
}

export function useCompanies() {
  return useQuery({
    queryKey: queryKeys.companies.all(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('company_info')
        .select('id, company_name, org_number, account_plan_type, currency')
        .order('company_name')
      if (error) throw error
      return data as Company[]
    },
  })
}
