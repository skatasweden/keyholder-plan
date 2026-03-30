import { useParams } from 'react-router-dom'
import { useFinancialYears } from '@/hooks/useFinancialYears'
import { useAccounts } from '@/hooks/useAccounts'
import { useHuvudbok } from '@/hooks/useHuvudbok'
import { formatSEK, formatDate } from '@/lib/format'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { useState } from 'react'

export function HuvudbokPage() {
  const { companyId } = useParams<{ companyId: string }>()
  const { data: fys } = useFinancialYears(companyId)
  const { data: accounts } = useAccounts(companyId)
  const [fyId, setFyId] = useState<string | undefined>()
  const [accountNumber, setAccountNumber] = useState<number | undefined>()
  const activeFyId = fyId ?? fys?.[0]?.id
  const { data, isLoading } = useHuvudbok(activeFyId, accountNumber)

  return (
    <div>
      <h1 className="font-display font-black text-[28px] text-brown tracking-tight mb-6">
        Huvudbok
      </h1>

      <div className="flex gap-3 mb-5">
        <select
          value={accountNumber ?? ''}
          onChange={e => setAccountNumber(e.target.value ? Number(e.target.value) : undefined)}
          className="flex-1 px-4 py-2.5 bg-white border-[1.5px] border-border rounded-[10px] text-sm font-medium text-brown"
        >
          <option value="">Valj konto...</option>
          {accounts?.map(a => (
            <option key={a.account_number} value={a.account_number}>
              {a.account_number} — {a.name}
            </option>
          ))}
        </select>
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

      {!accountNumber && (
        <div className="text-center py-12 text-text-muted text-sm">
          Valj ett konto ovan for att se huvudboken.
        </div>
      )}

      {isLoading && <LoadingSpinner />}

      {data && (
        <div className="bg-white border-[1.5px] border-border rounded-card overflow-hidden">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="bg-[#f8f4ef]">
                <th className="text-left px-4 py-3 font-bold text-brown text-[12px] uppercase tracking-wider">Vernr</th>
                <th className="text-left px-4 py-3 font-bold text-brown text-[12px] uppercase tracking-wider">Datum</th>
                <th className="text-left px-4 py-3 font-bold text-brown text-[12px] uppercase tracking-wider">Text</th>
                <th className="text-right px-4 py-3 font-bold text-brown text-[12px] uppercase tracking-wider">Debet</th>
                <th className="text-right px-4 py-3 font-bold text-brown text-[12px] uppercase tracking-wider">Kredit</th>
                <th className="text-right px-4 py-3 font-bold text-brown text-[12px] uppercase tracking-wider">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {/* Opening balance row */}
              <tr className="bg-brown/5">
                <td className="px-4 py-2" />
                <td className="px-4 py-2" />
                <td className="px-4 py-2 font-semibold text-brown">Ingaende balans</td>
                <td className="px-4 py-2" />
                <td className="px-4 py-2" />
                <td className="px-4 py-2 text-right font-bold tabular-nums">{formatSEK(data.openingBalance)}</td>
              </tr>
              {data.entries.map((e, i) => (
                <tr key={i} className={i % 2 ? 'bg-[#faf8f5]' : ''}>
                  <td className="px-4 py-2 text-text-muted font-semibold tabular-nums">{e.series}{e.voucher_number}</td>
                  <td className="px-4 py-2 text-text-muted tabular-nums">{formatDate(e.date)}</td>
                  <td className="px-4 py-2 text-brown-mid">{e.description ?? '\u2014'}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-pass">{e.debit > 0 ? formatSEK(e.debit) : ''}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-fail">{e.credit > 0 ? formatSEK(e.credit) : ''}</td>
                  <td className="px-4 py-2 text-right font-semibold tabular-nums">{formatSEK(e.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-4 py-3 text-xs text-text-muted border-t border-border">
            {data.entries.length} transaktioner
          </div>
        </div>
      )}
    </div>
  )
}
