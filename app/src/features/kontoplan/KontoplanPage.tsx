import { useParams } from 'react-router-dom'
import { useAccounts } from '@/hooks/useAccounts'
import { SearchInput } from '@/components/ui/SearchInput'
import { Badge } from '@/components/ui/Badge'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { useState, useMemo } from 'react'

export function KontoplanPage() {
  const { companyId } = useParams<{ companyId: string }>()
  const { data: accounts, isLoading } = useAccounts(companyId)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('')

  const filtered = useMemo(() => {
    if (!accounts) return []
    return accounts.filter(a => {
      if (typeFilter && a.account_type !== typeFilter) return false
      if (search) {
        const q = search.toLowerCase()
        return (
          String(a.account_number).includes(q) ||
          a.name.toLowerCase().includes(q) ||
          (a.sru_code && a.sru_code.includes(q))
        )
      }
      return true
    })
  }, [accounts, search, typeFilter])

  return (
    <div>
      <h1 className="font-display font-black text-[28px] text-brown tracking-tight mb-6">
        Kontoplan
      </h1>

      <div className="flex gap-3 mb-5">
        <div className="flex-1">
          <SearchInput value={search} onChange={setSearch} placeholder="Sok konto..." />
        </div>
        <select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
          className="px-4 py-2 bg-white border-[1.5px] border-border rounded-[10px] text-sm font-semibold text-brown"
        >
          <option value="">Alla typer</option>
          <option value="T">T — Tillgang</option>
          <option value="S">S — Skuld</option>
          <option value="K">K — Kostnad</option>
          <option value="I">I — Intakt</option>
        </select>
      </div>

      {isLoading ? <LoadingSpinner /> : (
        <div className="bg-white border-[1.5px] border-border rounded-card overflow-hidden">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="bg-[#f8f4ef]">
                <th className="text-left px-4 py-3 font-bold text-brown text-[12px] uppercase tracking-wider">Konto</th>
                <th className="text-left px-4 py-3 font-bold text-brown text-[12px] uppercase tracking-wider">Kontonamn</th>
                <th className="text-center px-4 py-3 font-bold text-brown text-[12px] uppercase tracking-wider">Typ</th>
                <th className="text-left px-4 py-3 font-bold text-brown text-[12px] uppercase tracking-wider">SRU</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a, i) => (
                <tr key={a.id} className={i % 2 ? 'bg-[#faf8f5]' : ''}>
                  <td className="px-4 py-2 text-text-muted font-semibold tabular-nums">{a.account_number}</td>
                  <td className="px-4 py-2 text-brown-mid">{a.name}</td>
                  <td className="px-4 py-2 text-center"><Badge type={a.account_type} /></td>
                  <td className="px-4 py-2 text-text-muted tabular-nums">{a.sru_code ?? '\u2014'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-4 py-3 text-xs text-text-muted border-t border-border">
            {filtered.length} konton {search || typeFilter ? `(av ${accounts?.length ?? 0})` : ''}
          </div>
        </div>
      )}
    </div>
  )
}
