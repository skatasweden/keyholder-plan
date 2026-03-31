'use client'

import { useEffect, useState } from 'react'
import { createBrowserSupabase } from '@/lib/supabase/control-plane'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Loader2 } from 'lucide-react'

interface CreditBalance {
  credits_remaining: number
  credits_used_total: number
  plan_credits_monthly: number
  next_reset_at: string
}

interface CreditTransaction {
  id: string
  amount: number
  reason: string
  tokens_in: number | null
  tokens_out: number | null
  created_at: string
}

const planInfo = {
  starter: { name: 'Starter', price: '0 kr/mo', credits: 20 },
  pro: { name: 'Pro', price: '499 kr/mo', credits: 200 },
  business: { name: 'Business', price: '1 499 kr/mo', credits: 1000 },
}

export default function BillingPage() {
  const [balance, setBalance] = useState<CreditBalance | null>(null)
  const [transactions, setTransactions] = useState<CreditTransaction[]>([])
  const [plan, setPlan] = useState<string>('starter')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const supabase = createBrowserSupabase()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: customer } = await supabase
        .from('customers')
        .select('id, plan')
        .eq('auth_user_id', user.id)
        .single()

      if (!customer) {
        setLoading(false)
        return
      }

      setPlan(customer.plan)

      const { data: bal } = await supabase
        .from('credit_balances')
        .select('*')
        .eq('customer_id', customer.id)
        .single()

      if (bal) setBalance(bal)

      const { data: txns } = await supabase
        .from('credit_transactions')
        .select('*')
        .eq('customer_id', customer.id)
        .order('created_at', { ascending: false })
        .limit(20)

      if (txns) setTransactions(txns)

      setLoading(false)
    }
    load()
  }, [])

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    )
  }

  const info = planInfo[plan as keyof typeof planInfo] || planInfo.starter

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold">Billing & Credits</h1>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Plan</CardDescription>
            <CardTitle className="text-lg">{info.name}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-500">{info.price}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Credits remaining</CardDescription>
            <CardTitle className="text-lg">
              {balance?.credits_remaining ?? 0}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-500">
              of {info.credits} monthly
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total used</CardDescription>
            <CardTitle className="text-lg">
              {balance?.credits_used_total ?? 0}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-500">
              Resets{' '}
              {balance?.next_reset_at
                ? new Date(balance.next_reset_at).toLocaleDateString('sv-SE')
                : '-'}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Transactions</CardTitle>
        </CardHeader>
        <CardContent>
          {transactions.length === 0 ? (
            <p className="text-sm text-gray-500">No transactions yet</p>
          ) : (
            <div className="space-y-2">
              {transactions.map((txn) => (
                <div
                  key={txn.id}
                  className="flex items-center justify-between border-b pb-2 last:border-0"
                >
                  <div>
                    <p className="text-sm capitalize">
                      {txn.reason.replace('_', ' ')}
                    </p>
                    <p className="text-xs text-gray-400">
                      {new Date(txn.created_at).toLocaleString('sv-SE')}
                    </p>
                  </div>
                  <Badge variant={txn.amount > 0 ? 'default' : 'secondary'}>
                    {txn.amount > 0 ? '+' : ''}
                    {txn.amount}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
