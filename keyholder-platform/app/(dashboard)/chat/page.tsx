'use client'

import { useEffect, useState } from 'react'
import { ChatWindow } from '@/components/chat/chat-window'
import { createBrowserSupabase } from '@/lib/supabase/control-plane'
import { Loader2 } from 'lucide-react'

export default function ChatPage() {
  const [tenantId, setTenantId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadTenant() {
      const supabase = createBrowserSupabase()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: customer } = await supabase
        .from('customers')
        .select('id')
        .eq('auth_user_id', user.id)
        .single()

      if (customer) {
        setTenantId(customer.id)
      }
      setLoading(false)
    }
    loadTenant()
  }, [])

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    )
  }

  if (!tenantId) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-gray-500">
          No workspace found. Please complete onboarding first.
        </p>
      </div>
    )
  }

  return <ChatWindow tenantId={tenantId} />
}
