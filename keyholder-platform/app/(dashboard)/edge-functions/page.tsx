'use client'

import { useEffect, useState } from 'react'
import { createBrowserSupabase } from '@/lib/supabase/control-plane'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Loader2, Zap } from 'lucide-react'

interface EdgeFunction {
  id: string
  slug: string
  name: string
  status: string
  version: number
  created_at: string
  updated_at: string
}

export default function EdgeFunctionsPage() {
  const [functions, setFunctions] = useState<EdgeFunction[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const supabase = createBrowserSupabase()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: customer } = await supabase
        .from('customers')
        .select('id')
        .eq('auth_user_id', user.id)
        .single()

      if (!customer) {
        setLoading(false)
        return
      }

      const res = await fetch(`/api/edge-functions?customerId=${customer.id}`)
      if (res.ok) {
        const data = await res.json()
        setFunctions(Array.isArray(data) ? data : [])
      }
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

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Edge Functions</h1>
        <p className="text-sm text-gray-500">
          Automated functions deployed to your database. Create new ones via chat.
        </p>
      </div>

      {functions.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-10">
            <Zap className="h-10 w-10 text-gray-300" />
            <p className="mt-2 text-gray-500">No edge functions yet</p>
            <p className="text-sm text-gray-400">
              Ask Claude to create one in the chat
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {functions.map((fn) => (
            <Card key={fn.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Zap className="h-4 w-4" />
                    {fn.name || fn.slug}
                  </CardTitle>
                  <Badge variant={fn.status === 'ACTIVE' ? 'default' : 'secondary'}>
                    {fn.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-gray-500">
                  Version {fn.version} &middot; Updated{' '}
                  {new Date(fn.updated_at).toLocaleDateString('sv-SE')}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
