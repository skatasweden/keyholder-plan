'use client'

import { useQuery } from '@tanstack/react-query'
import { createBrowserSupabase } from '@/lib/supabase/control-plane'
import { Badge } from '@/components/ui/badge'

export function CreditBadge() {
  const { data: credits } = useQuery({
    queryKey: ['credits'],
    queryFn: async () => {
      const supabase = createBrowserSupabase()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return null

      const { data } = await supabase
        .from('credit_balances')
        .select('credits_remaining')
        .single()

      return data?.credits_remaining ?? 0
    },
    refetchInterval: 30_000,
  })

  return (
    <div className="flex items-center gap-2 px-3">
      <Badge variant={credits && credits > 5 ? 'default' : 'destructive'}>
        {credits ?? '...'} credits
      </Badge>
    </div>
  )
}
