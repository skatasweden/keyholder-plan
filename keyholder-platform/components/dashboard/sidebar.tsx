'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  MessageSquare,
  Settings,
  CreditCard,
  Code,
  FileText,
  LogOut,
} from 'lucide-react'
import { createBrowserSupabase } from '@/lib/supabase/control-plane'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { CreditBadge } from './credit-badge'
import { cn } from '@/lib/utils'

const navItems = [
  { href: '/chat', label: 'Chat', icon: MessageSquare },
  { href: '/edge-functions', label: 'Edge Functions', icon: Code },
  { href: '/settings', label: 'Settings', icon: Settings },
  { href: '/billing', label: 'Billing', icon: CreditCard },
]

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()

  const { data: customPages } = useQuery<{ slug: string; title: string; icon: string }[]>({
    queryKey: ['custom-pages'],
    queryFn: async () => {
      const supabase = createBrowserSupabase()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return []
      const { data: customer } = await supabase
        .from('customers')
        .select('id')
        .eq('auth_user_id', user.id)
        .single()
      if (!customer) return []
      const res = await fetch(`/api/custom-pages?customerId=${customer.id}`)
      return res.ok ? res.json() : []
    },
    refetchInterval: 60_000,
  })

  async function handleLogout() {
    const supabase = createBrowserSupabase()
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <aside className="flex h-screen w-64 flex-col border-r bg-gray-50">
      <div className="p-4">
        <h1 className="text-xl font-bold">KEYHOLDER</h1>
      </div>

      <nav className="flex-1 space-y-1 px-2">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex items-center gap-3 rounded-md px-3 py-2 text-sm',
              pathname === item.href
                ? 'bg-gray-200 font-medium'
                : 'text-gray-600 hover:bg-gray-100'
            )}
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </Link>
        ))}

        {customPages && customPages.length > 0 && (
          <>
            <div className="px-3 pt-4 pb-1 text-xs font-semibold uppercase text-gray-400">
              My Tools
            </div>
            {customPages.map((page) => (
              <Link
                key={page.slug}
                href={`/pages/${page.slug}`}
                className={cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm',
                  pathname === `/pages/${page.slug}`
                    ? 'bg-gray-200 font-medium'
                    : 'text-gray-600 hover:bg-gray-100'
                )}
              >
                <FileText className="h-4 w-4" />
                {page.title}
              </Link>
            ))}
          </>
        )}
      </nav>

      <div className="border-t p-4 space-y-3">
        <CreditBadge />
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-gray-600 hover:bg-gray-100"
        >
          <LogOut className="h-4 w-4" />
          Log out
        </button>
      </div>
    </aside>
  )
}
