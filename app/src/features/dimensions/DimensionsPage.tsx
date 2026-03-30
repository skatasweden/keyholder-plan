import { useParams } from 'react-router-dom'
import { useFinancialYears } from '@/hooks/useFinancialYears'
import { useDimensions } from '@/hooks/useDimensions'
import { formatSEK } from '@/lib/format'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { useState } from 'react'

export function DimensionsPage() {
  const { companyId } = useParams<{ companyId: string }>()
  const { data: fys } = useFinancialYears(companyId)
  const activeFyId = fys?.[0]?.id
  const { data: dimensions, isLoading } = useDimensions(companyId, activeFyId)
  const [expandedDim, setExpandedDim] = useState<number | null>(null)

  return (
    <div>
      <h1 className="font-display font-black text-[28px] text-brown tracking-tight mb-6">
        Dimensioner
      </h1>

      {isLoading ? <LoadingSpinner /> : (
        <div className="space-y-3">
          {dimensions?.length === 0 && (
            <div className="text-center py-12 text-text-muted text-sm">
              Inga dimensioner importerade for detta foretag.
            </div>
          )}
          {dimensions?.map(dim => {
            const isExpanded = expandedDim === dim.dimension_number
            return (
              <div key={dim.id} className="bg-white border-[1.5px] border-border rounded-card overflow-hidden">
                <button
                  onClick={() => setExpandedDim(isExpanded ? null : dim.dimension_number)}
                  className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-bg-alt transition-colors"
                >
                  <div>
                    <span className="font-display font-bold text-brown">
                      Dimension {dim.dimension_number}
                    </span>
                    <span className="text-text-muted ml-2">&mdash; {dim.name}</span>
                    {dim.parent_dimension !== null && (
                      <span className="text-xs text-text-muted ml-2">(underdimension av {dim.parent_dimension})</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-text-muted">{dim.objects.length} objekt</span>
                    <span className="text-text-muted text-sm">{isExpanded ? '\u25B2' : '\u25BC'}</span>
                  </div>
                </button>

                {isExpanded && dim.objects.length > 0 && (
                  <div className="border-t border-border">
                    <table className="w-full text-[13px]">
                      <thead>
                        <tr className="bg-[#f8f4ef]">
                          <th className="text-left px-5 py-2 font-bold text-[11px] uppercase tracking-wider">Nr</th>
                          <th className="text-left px-5 py-2 font-bold text-[11px] uppercase tracking-wider">Namn</th>
                          <th className="text-right px-5 py-2 font-bold text-[11px] uppercase tracking-wider">Ing. balans</th>
                          <th className="text-right px-5 py-2 font-bold text-[11px] uppercase tracking-wider">Utg. balans</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dim.objects.map((obj, i) => (
                          <tr key={obj.object_number} className={i % 2 ? 'bg-[#faf8f5]' : ''}>
                            <td className="px-5 py-2 text-text-muted font-semibold">{obj.object_number}</td>
                            <td className="px-5 py-2 text-brown-mid">{obj.name}</td>
                            <td className="px-5 py-2 text-right tabular-nums">{formatSEK(obj.opening_balance)}</td>
                            <td className="px-5 py-2 text-right font-semibold tabular-nums">{formatSEK(obj.closing_balance)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {isExpanded && dim.objects.length === 0 && (
                  <div className="border-t border-border px-5 py-4 text-sm text-text-muted">
                    Inga objekt definierade for denna dimension.
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
