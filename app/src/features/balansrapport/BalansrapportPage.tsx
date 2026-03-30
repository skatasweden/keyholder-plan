import { useParams } from 'react-router-dom'
import { useFinancialYears } from '@/hooks/useFinancialYears'
import { useBalansrapport, type BalansRow } from '@/hooks/useBalansrapport'
import { balansGroups, accountsInRange, sumRange } from '@/lib/account-groups'
import { formatSEK } from '@/lib/format'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { useState } from 'react'

export function BalansrapportPage() {
  const { companyId } = useParams<{ companyId: string }>()
  const { data: fys } = useFinancialYears(companyId)
  const [fyId, setFyId] = useState<string | undefined>()
  const activeFyId = fyId ?? fys?.[0]?.id
  const { data: rows, isLoading } = useBalansrapport(activeFyId)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display font-black text-[28px] text-brown tracking-tight">
          Balansrapport
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

      {isLoading ? <LoadingSpinner /> : rows && (
        <div className="bg-white border-[1.5px] border-border rounded-card overflow-hidden">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="bg-[#f8f4ef]">
                <th className="text-left px-4 py-3 font-bold text-brown text-[12px] uppercase tracking-wider">Konto</th>
                <th className="text-left px-4 py-3 font-bold text-brown text-[12px] uppercase tracking-wider">Kontonamn</th>
                <th className="text-right px-4 py-3 font-bold text-brown text-[12px] uppercase tracking-wider">Ing. balans</th>
                <th className="text-right px-4 py-3 font-bold text-brown text-[12px] uppercase tracking-wider">Period</th>
                <th className="text-right px-4 py-3 font-bold text-brown text-[12px] uppercase tracking-wider">Utg. balans</th>
              </tr>
            </thead>
            <tbody>
              {balansGroups.map(group => (
                <GroupSection key={group.label} group={group} rows={rows} />
              ))}
              {/* Total */}
              <tr className="border-t-2 border-border">
                <td colSpan={2} className="px-4 py-3 font-bold text-brown">BERAKNAT RESULTAT</td>
                <td className="px-4 py-3 text-right font-bold tabular-nums">
                  {formatSEK(sumRange(rows, 1000, 2999, 'ing_balans'))}
                </td>
                <td className="px-4 py-3 text-right font-bold tabular-nums">
                  {formatSEK(sumRange(rows, 1000, 2999, 'period'))}
                </td>
                <td className="px-4 py-3 text-right font-bold text-accent font-display text-[15px] tabular-nums">
                  {formatSEK(sumRange(rows, 1000, 2999, 'utg_balans'))}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function GroupSection({ group, rows }: { group: typeof balansGroups[0]; rows: BalansRow[] }) {
  const groupRows = accountsInRange(rows, group.range[0], group.range[1])
  if (groupRows.length === 0) return null

  return (
    <>
      <tr className="bg-brown">
        <td colSpan={5} className="px-4 py-2.5 font-display font-bold text-white text-sm">
          {group.label}
        </td>
      </tr>
      {group.subgroups?.map(sub => {
        const subRows = accountsInRange(rows, sub.range[0], sub.range[1])
        if (subRows.length === 0) return null
        return subRows.map((row, i) => (
          <tr key={row.account_number} className={i % 2 ? 'bg-[#faf8f5]' : ''}>
            <td className="px-4 py-2 text-text-muted font-semibold">{row.account_number}</td>
            <td className="px-4 py-2 text-brown-mid">{row.account_name}</td>
            <td className="px-4 py-2 text-right tabular-nums">{formatSEK(row.ing_balans)}</td>
            <td className="px-4 py-2 text-right tabular-nums">{formatSEK(row.period)}</td>
            <td className="px-4 py-2 text-right font-semibold tabular-nums">{formatSEK(row.utg_balans)}</td>
          </tr>
        ))
      })}
      {!group.subgroups && groupRows.map((row, i) => (
        <tr key={row.account_number} className={i % 2 ? 'bg-[#faf8f5]' : ''}>
          <td className="px-4 py-2 text-text-muted font-semibold">{row.account_number}</td>
          <td className="px-4 py-2 text-brown-mid">{row.account_name}</td>
          <td className="px-4 py-2 text-right tabular-nums">{formatSEK(row.ing_balans)}</td>
          <td className="px-4 py-2 text-right tabular-nums">{formatSEK(row.period)}</td>
          <td className="px-4 py-2 text-right font-semibold tabular-nums">{formatSEK(row.utg_balans)}</td>
        </tr>
      ))}
      <tr className="border-t-[1.5px] border-border">
        <td colSpan={2} className="px-4 py-2.5 font-bold text-brown text-[13px]">
          SUMMA {group.label}
        </td>
        <td className="px-4 py-2.5 text-right font-bold tabular-nums">
          {formatSEK(sumRange(groupRows, group.range[0], group.range[1], 'ing_balans'))}
        </td>
        <td className="px-4 py-2.5 text-right font-bold tabular-nums">
          {formatSEK(sumRange(groupRows, group.range[0], group.range[1], 'period'))}
        </td>
        <td className="px-4 py-2.5 text-right font-bold tabular-nums">
          {formatSEK(sumRange(groupRows, group.range[0], group.range[1], 'utg_balans'))}
        </td>
      </tr>
    </>
  )
}
