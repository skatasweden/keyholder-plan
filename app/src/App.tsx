import { Routes, Route, Navigate } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { ImportPage } from '@/features/import/ImportPage'
import { OverviewPage } from '@/features/overview/OverviewPage'
import { BalansrapportPage } from '@/features/balansrapport/BalansrapportPage'
import { ResultatrapportPage } from '@/features/resultatrapport/ResultatrapportPage'
import { KontoplanPage } from '@/features/kontoplan/KontoplanPage'
import { VoucherListPage } from '@/features/verifikationer/VoucherListPage'
import { HuvudbokPage } from '@/features/huvudbok/HuvudbokPage'

function Placeholder({ title }: { title: string }) {
  return (
    <div className="py-8">
      <h1 className="font-display font-bold text-2xl text-brown">{title}</h1>
      <p className="text-text-muted mt-2">Coming soon...</p>
    </div>
  )
}

export function App() {
  return (
    <Routes>
      <Route path="/import" element={<AppLayout><ImportPage /></AppLayout>} />
      <Route path="/company/:companyId" element={<AppLayout><OverviewPage /></AppLayout>} />
      <Route path="/company/:companyId/kontoplan" element={<AppLayout><KontoplanPage /></AppLayout>} />
      <Route path="/company/:companyId/huvudbok" element={<AppLayout><HuvudbokPage /></AppLayout>} />
      <Route path="/company/:companyId/verifikationer" element={<AppLayout><VoucherListPage /></AppLayout>} />
      <Route path="/company/:companyId/balansrapport" element={<AppLayout><BalansrapportPage /></AppLayout>} />
      <Route path="/company/:companyId/resultatrapport" element={<AppLayout><ResultatrapportPage /></AppLayout>} />
      <Route path="/company/:companyId/validering" element={<AppLayout><Placeholder title="Validering" /></AppLayout>} />
      <Route path="/company/:companyId/dimensioner" element={<AppLayout><Placeholder title="Dimensioner" /></AppLayout>} />
      <Route path="*" element={<Navigate to="/import" replace />} />
    </Routes>
  )
}
