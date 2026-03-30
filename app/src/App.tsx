import { Routes, Route, Navigate } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { ImportPage } from '@/features/import/ImportPage'

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
      <Route path="/company/:companyId" element={<AppLayout><Placeholder title="Oversikt" /></AppLayout>} />
      <Route path="/company/:companyId/kontoplan" element={<AppLayout><Placeholder title="Kontoplan" /></AppLayout>} />
      <Route path="/company/:companyId/huvudbok" element={<AppLayout><Placeholder title="Huvudbok" /></AppLayout>} />
      <Route path="/company/:companyId/verifikationer" element={<AppLayout><Placeholder title="Verifikationer" /></AppLayout>} />
      <Route path="/company/:companyId/balansrapport" element={<AppLayout><Placeholder title="Balansrapport" /></AppLayout>} />
      <Route path="/company/:companyId/resultatrapport" element={<AppLayout><Placeholder title="Resultatrapport" /></AppLayout>} />
      <Route path="/company/:companyId/validering" element={<AppLayout><Placeholder title="Validering" /></AppLayout>} />
      <Route path="/company/:companyId/dimensioner" element={<AppLayout><Placeholder title="Dimensioner" /></AppLayout>} />
      <Route path="*" element={<Navigate to="/import" replace />} />
    </Routes>
  )
}
