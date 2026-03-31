import { Sidebar } from '@/components/dashboard/sidebar'
import { QueryProvider } from '@/components/query-provider'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <QueryProvider>
      <div className="flex h-screen">
        <Sidebar />
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </QueryProvider>
  )
}
