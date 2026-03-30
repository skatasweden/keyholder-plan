import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { queryKeys } from '@/lib/query-keys'

const PAGE_SIZE = 50

export interface VoucherRow {
  id: string
  account_number: number
  amount: string
  description: string | null
  transaction_type: string
}

export interface Voucher {
  id: string
  series: string
  voucher_number: number
  date: string
  description: string | null
  voucher_rows: VoucherRow[]
}

export function useVouchers(fyId: string | undefined, page: number) {
  return useQuery({
    queryKey: queryKeys.vouchers.list(fyId!, page),
    queryFn: async () => {
      const from = page * PAGE_SIZE
      const to = from + PAGE_SIZE - 1
      const { data, error, count } = await supabase
        .from('vouchers')
        .select('id, series, voucher_number, date, description, voucher_rows(id, account_number, amount, description, transaction_type)', { count: 'exact' })
        .eq('financial_year_id', fyId!)
        .order('date', { ascending: false })
        .order('voucher_number', { ascending: false })
        .range(from, to)
      if (error) throw error
      return {
        vouchers: (data ?? []) as Voucher[],
        total: count ?? 0,
        pageSize: PAGE_SIZE,
      }
    },
    enabled: !!fyId,
  })
}
