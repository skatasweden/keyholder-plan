import { useParams } from 'react-router-dom'
import { useFinancialYears } from '@/hooks/useFinancialYears'
import { useVouchers } from '@/hooks/useVouchers'
import { formatSEK, formatDate } from '@/lib/format'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { SearchInput } from '@/components/ui/SearchInput'
import { useState, useMemo } from 'react'

export function VoucherListPage() {
  const { companyId } = useParams<{ companyId: string }>()
  const { data: fys } = useFinancialYears(companyId)
  const [fyId, setFyId] = useState<string | undefined>()
  const activeFyId = fyId ?? fys?.[0]?.id
  const [page, setPage] = useState(0)
  const [search, setSearch] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const { data, isLoading } = useVouchers(activeFyId, page)

  const filtered = useMemo(() => {
    if (!data?.vouchers) return []
    if (!search) return data.vouchers
    const q = search.toLowerCase()
    return data.vouchers.filter(v =>
      v.series.toLowerCase().includes(q) ||
      String(v.voucher_number).includes(q) ||
      (v.description && v.description.toLowerCase().includes(q))
    )
  }, [data?.vouchers, search])

  const totalPages = data ? Math.ceil(data.total / data.pageSize) : 0

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display font-black text-[28px] text-brown tracking-tight">
          Verifikationer
        </h1>
        {fys && (
          <select
            value={activeFyId ?? ''}
            onChange={e => { setFyId(e.target.value); setPage(0) }}
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

      <div className="mb-5">
        <SearchInput value={search} onChange={setSearch} placeholder="Sok verifikation..." />
      </div>

      {isLoading ? <LoadingSpinner /> : (
        <div className="bg-white border-[1.5px] border-border rounded-card overflow-hidden">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="bg-[#f8f4ef]">
                <th className="text-left px-4 py-3 font-bold text-brown text-[12px] uppercase tracking-wider">Serie</th>
                <th className="text-left px-4 py-3 font-bold text-brown text-[12px] uppercase tracking-wider">Nr</th>
                <th className="text-left px-4 py-3 font-bold text-brown text-[12px] uppercase tracking-wider">Datum</th>
                <th className="text-left px-4 py-3 font-bold text-brown text-[12px] uppercase tracking-wider">Beskrivning</th>
                <th className="text-right px-4 py-3 font-bold text-brown text-[12px] uppercase tracking-wider">Belopp</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(v => {
                const totalDebit = v.voucher_rows
                  .filter(r => r.transaction_type === 'normal' && parseFloat(r.amount) > 0)
                  .reduce((s, r) => s + parseFloat(r.amount), 0)
                const isExpanded = expandedId === v.id

                return (
                  <VoucherEntry
                    key={v.id}
                    voucher={v}
                    totalDebit={totalDebit}
                    isExpanded={isExpanded}
                    onToggle={() => setExpandedId(isExpanded ? null : v.id)}
                  />
                )
              })}
            </tbody>
          </table>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border">
              <span className="text-xs text-text-muted">
                Sida {page + 1} av {totalPages} ({data?.total} verifikationer)
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="px-3 py-1.5 text-xs font-semibold rounded-badge border border-border
                    disabled:opacity-40 hover:bg-bg-alt transition-colors"
                >
                  Foregaende
                </button>
                <button
                  onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="px-3 py-1.5 text-xs font-semibold rounded-badge border border-border
                    disabled:opacity-40 hover:bg-bg-alt transition-colors"
                >
                  Nasta
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function VoucherEntry({
  voucher: v,
  totalDebit,
  isExpanded,
  onToggle,
}: {
  voucher: { id: string; series: string; voucher_number: number; date: string; description: string | null; voucher_rows: Array<{ id: string; account_number: number; amount: string; description: string | null; transaction_type: string }> }
  totalDebit: number
  isExpanded: boolean
  onToggle: () => void
}) {
  return (
    <>
      <tr
        onClick={onToggle}
        className="cursor-pointer hover:bg-bg-alt transition-colors"
      >
        <td className="px-4 py-2">
          <span className="inline-block px-2 py-0.5 rounded-badge text-[11px] font-bold bg-accent-light text-accent-dark">
            {v.series}
          </span>
        </td>
        <td className="px-4 py-2 font-semibold tabular-nums">{v.voucher_number}</td>
        <td className="px-4 py-2 text-text-muted tabular-nums">{formatDate(v.date)}</td>
        <td className="px-4 py-2 text-brown-mid">{v.description ?? '\u2014'}</td>
        <td className="px-4 py-2 text-right font-semibold tabular-nums">{formatSEK(totalDebit)}</td>
      </tr>
      {isExpanded && v.voucher_rows.map(row => (
        <tr key={row.id} className="bg-[#f5f0ea]">
          <td className="px-4 py-1.5" />
          <td className="px-4 py-1.5 text-text-muted text-[12px] tabular-nums">{row.account_number}</td>
          <td className="px-4 py-1.5 text-text-muted text-[12px]">{row.description ?? ''}</td>
          <td className="px-4 py-1.5 text-right text-[12px] tabular-nums text-pass">
            {parseFloat(row.amount) > 0 ? formatSEK(row.amount) : ''}
          </td>
          <td className="px-4 py-1.5 text-right text-[12px] tabular-nums text-fail">
            {parseFloat(row.amount) < 0 ? formatSEK(-parseFloat(row.amount)) : ''}
          </td>
        </tr>
      ))}
    </>
  )
}
