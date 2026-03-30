import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { queryKeys } from '@/lib/query-keys'
import { parseNumeric } from '@/lib/format'

export interface HuvudbokEntry {
  date: string
  series: string
  voucher_number: number
  description: string | null
  debit: number
  credit: number
  balance: number
}

export function useHuvudbok(fyId: string | undefined, accountNumber: number | undefined) {
  return useQuery({
    queryKey: queryKeys.huvudbok.byAccount(fyId!, accountNumber!),
    queryFn: async () => {
      // Get opening balance
      const { data: ibData } = await supabase
        .from('opening_balances')
        .select('amount')
        .eq('financial_year_id', fyId!)
        .eq('account_number', accountNumber!)
        .is('dimension_number', null)
        .single()
      const openingBalance = parseNumeric(ibData?.amount)

      // Get voucher rows for this account, joined with voucher info
      const { data: rows, error } = await supabase
        .from('voucher_rows')
        .select('amount, description, voucher:vouchers!inner(series, voucher_number, date, description)')
        .eq('account_number', accountNumber!)
        .eq('voucher.financial_year_id', fyId!)
        .order('voucher(date)')
        .order('voucher(voucher_number)')
      if (error) throw error

      // Build entries with running balance
      let balance = openingBalance
      const entries: HuvudbokEntry[] = []

      for (const row of rows ?? []) {
        const v = row.voucher as unknown as { series: string; voucher_number: number; date: string; description: string | null }
        const amount = parseNumeric(row.amount)
        const debit = amount > 0 ? amount : 0
        const credit = amount < 0 ? -amount : 0
        balance += amount
        entries.push({
          date: v.date,
          series: v.series,
          voucher_number: v.voucher_number,
          description: row.description || v.description || null,
          debit,
          credit,
          balance,
        })
      }

      return { openingBalance, entries }
    },
    enabled: !!fyId && !!accountNumber,
  })
}
