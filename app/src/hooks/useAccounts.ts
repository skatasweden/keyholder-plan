import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { queryKeys } from '@/lib/query-keys'

export interface Account {
  id: string
  account_number: number
  name: string
  account_type: string | null
  quantity_unit: string | null
  sru_code: string | null
}

export function useAccounts(companyId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.accounts.byCompany(companyId!),
    queryFn: async () => {
      const { data: accounts, error } = await supabase
        .from('accounts')
        .select('id, account_number, name, account_type, quantity_unit')
        .eq('company_id', companyId!)
        .order('account_number')
      if (error) throw error

      // Fetch SRU codes separately
      const { data: sruCodes } = await supabase
        .from('sru_codes')
        .select('account_number, sru_code')
        .eq('company_id', companyId!)
      const sruMap = new Map<number, string>()
      for (const s of sruCodes ?? []) {
        sruMap.set(s.account_number, s.sru_code)
      }

      return (accounts ?? []).map(a => ({
        ...a,
        sru_code: sruMap.get(a.account_number) ?? null,
      })) as Account[]
    },
    enabled: !!companyId,
  })
}
