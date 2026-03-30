import { Routes, Route, Navigate } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { ImportPage } from '@/features/import/ImportPage'
import { OverviewPage } from '@/features/overview/OverviewPage'
import { BalansrapportPage } from '@/features/balansrapport/BalansrapportPage'
import { ResultatrapportPage } from '@/features/resultatrapport/ResultatrapportPage'
import { KontoplanPage } from '@/features/kontoplan/KontoplanPage'
import { VoucherListPage } from '@/features/verifikationer/VoucherListPage'
import { HuvudbokPage } from '@/features/huvudbok/HuvudbokPage'
import { ValidationPage } from '@/features/validation/ValidationPage'
import { DimensionsPage } from '@/features/dimensions/DimensionsPage'

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
      <Route path="/company/:companyId/validering" element={<AppLayout><ValidationPage /></AppLayout>} />
      <Route path="/company/:companyId/dimensioner" element={<AppLayout><DimensionsPage /></AppLayout>} />
      <Route path="*" element={<Navigate to="/import" replace />} />
    </Routes>
  )
}
