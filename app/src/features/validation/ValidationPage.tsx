import { useParams } from 'react-router-dom'
import { useFinancialYears } from '@/hooks/useFinancialYears'
import { useValidation } from '@/hooks/useValidation'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { DropZone } from '@/components/ui/DropZone'
import { formatSEK } from '@/lib/format'
import { useState } from 'react'

interface FortnoxResult {
  type: string
  data: {
    rows?: Array<{ account_number: number; amount: number; name?: string }>
  }
}

export function ValidationPage() {
  const { companyId } = useParams<{ companyId: string }>()
  const { data: fys } = useFinancialYears(companyId)
  const [fyId, setFyId] = useState<string | undefined>()
  const activeFyId = fyId ?? fys?.[0]?.id
  const { data, isLoading } = useValidation(companyId, activeFyId)
  const [fortnoxResult, setFortnoxResult] = useState<FortnoxResult | null>(null)
  const [fortnoxError, setFortnoxError] = useState<string | null>(null)

  const passCount = data?.checks.filter(c => c.status === 'pass').length ?? 0
  const totalCount = data?.checks.length ?? 0

  const handleFortnoxFile = async (file: File) => {
    setFortnoxError(null)
    const form = new FormData()
    form.append('file', file)
    try {
      const res = await fetch('/api/validate/fortnox', { method: 'POST', body: form })
      if (!res.ok) throw new Error(await res.text())
      setFortnoxResult(await res.json())
    } catch (err) {
      setFortnoxError(String(err))
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display font-black text-[28px] text-brown tracking-tight">
          Validering
        </h1>
        {fys && (
          <select
            value={activeFyId ?? ''}
            onChange={e => setFyId(e.target.value)}
            className="px-4 py-2 bg-white border-[1.5px] border-border rounded-pill text-sm font-semibold text-brown"
          >
            {fys.map(fy => (
              <option key={fy.id} value={fy.id}>
                {fy.start_date} &mdash; {fy.end_date}
              </option>
            ))}
          </select>
        )}
      </div>

      {isLoading ? <LoadingSpinner /> : data && (
        <>
          {/* Score */}
          <div className="text-center mb-8">
            <div className={`font-display font-black text-[48px] leading-none ${data.passed ? 'text-pass' : 'text-fail'}`}>
              {passCount}/{totalCount}
            </div>
            <div className="text-sm text-text-muted mt-1">
              {data.passed ? 'Alla kontroller godkanda' : 'Nagra kontroller misslyckades'}
            </div>
          </div>

          {/* Check grid */}
          <div className="grid grid-cols-2 gap-3 mb-8">
            {data.checks.map(check => (
              <div key={check.name} className="bg-white border-[1.5px] border-border rounded-card p-4 flex items-start gap-3">
                <div className={`w-3 h-3 rounded-full mt-0.5 flex-shrink-0 ${check.status === 'pass' ? 'bg-pass' : 'bg-fail'}`} />
                <div>
                  <div className="text-sm font-semibold text-brown">{check.name}</div>
                  <div className="text-xs text-text-muted mt-0.5">
                    Forvantat: {check.expected} &middot; Resultat: {check.actual}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Fortnox comparison */}
          <div className="border-t border-border pt-8">
            <h2 className="font-display font-bold text-lg text-brown mb-4">
              Fortnox-jamforelse
            </h2>
            <p className="text-sm text-text-body mb-4">
              Ladda upp en HTML-rapport fran Fortnox for att jamfora belopp.
            </p>
            <DropZone
              onFile={handleFortnoxFile}
              accept=".html,.htm"
              label="Dra och slapp en Fortnox HTML-rapport"
              sublabel="Stoder Balansrapport, Resultatrapport, Huvudbok, Verifikationslista"
            />

            {fortnoxError && (
              <div className="mt-4 p-4 bg-fail/10 rounded-card border border-fail/30">
                <span className="text-sm text-fail font-medium">{fortnoxError}</span>
              </div>
            )}

            {fortnoxResult && (
              <div className="mt-4 bg-white border-[1.5px] border-border rounded-card p-4">
                <div className="text-sm font-semibold text-brown mb-3">
                  Rapport: {fortnoxResult.type}
                </div>
                {fortnoxResult.data.rows && (
                  <table className="w-full text-[13px]">
                    <thead>
                      <tr className="bg-[#f8f4ef]">
                        <th className="text-left px-3 py-2 font-bold text-[11px] uppercase">Konto</th>
                        <th className="text-left px-3 py-2 font-bold text-[11px] uppercase">Namn</th>
                        <th className="text-right px-3 py-2 font-bold text-[11px] uppercase">Belopp</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fortnoxResult.data.rows.slice(0, 50).map((r, i) => (
                        <tr key={i} className={i % 2 ? 'bg-[#faf8f5]' : ''}>
                          <td className="px-3 py-1.5 tabular-nums">{r.account_number}</td>
                          <td className="px-3 py-1.5 text-brown-mid">{r.name ?? ''}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{formatSEK(r.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
