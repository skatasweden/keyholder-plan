import { useParams } from 'react-router-dom'
import { useCompanies } from '@/hooks/useCompanies'
import { useFinancialYears } from '@/hooks/useFinancialYears'
import { supabase } from '@/lib/supabase'
import { useQuery } from '@tanstack/react-query'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'

export function OverviewPage() {
  const { companyId } = useParams<{ companyId: string }>()
  const { data: companies } = useCompanies()
  const { data: fys } = useFinancialYears(companyId)
  const company = companies?.find(c => c.id === companyId)
  const currentFy = fys?.[0]

  const { data: stats } = useQuery({
    queryKey: ['overview-stats', companyId],
    queryFn: async () => {
      const [accounts, vouchers, dimensions] = await Promise.all([
        supabase.from('accounts').select('*', { count: 'exact', head: true }).eq('company_id', companyId!),
        supabase.from('vouchers').select('*', { count: 'exact', head: true }).eq('company_id', companyId!),
        supabase.from('dimensions').select('*', { count: 'exact', head: true }).eq('company_id', companyId!),
      ])
      return {
        accounts: accounts.count ?? 0,
        vouchers: vouchers.count ?? 0,
        dimensions: dimensions.count ?? 0,
        financialYears: fys?.length ?? 0,
      }
    },
    enabled: !!companyId && !!fys,
  })

  if (!company) return <LoadingSpinner />

  return (
    <div>
      <div className="mb-7">
        <h1 className="font-display font-black text-[28px] text-brown tracking-tight">
          Oversikt
        </h1>
        <p className="text-sm text-text-muted mt-1">
          {company.company_name} &mdash; {currentFy
            ? `${currentFy.start_date} till ${currentFy.end_date}`
            : 'Inga rakenskapsar'}
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-4 gap-3.5 mb-7">
        {[
          { value: stats?.accounts ?? '\u2014', label: 'Konton' },
          { value: stats?.vouchers ?? '\u2014', label: 'Verifikationer' },
          { value: stats?.dimensions ?? '\u2014', label: 'Dimensioner' },
          { value: stats?.financialYears ?? '\u2014', label: 'Rakenskapsar' },
        ].map(s => (
          <div key={s.label} className="bg-white border-[1.5px] border-border rounded-stat p-5 text-center">
            <div className="font-display font-black text-[32px] text-brown leading-none">
              {s.value}
            </div>
            <div className="text-[13px] font-semibold text-text-muted mt-1.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Company info + FY info */}
      <div className="grid grid-cols-2 gap-3.5">
        <div className="bg-white border-[1.5px] border-border rounded-card p-6">
          <h2 className="font-display font-bold text-base text-brown mb-3">Foretagsinfo</h2>
          <dl className="text-sm text-text-body leading-[1.8]">
            <div><span className="text-text-muted">Org.nr:</span> {company.org_number}</div>
            <div><span className="text-text-muted">Kontoplan:</span> {company.account_plan_type ?? '\u2014'}</div>
            <div><span className="text-text-muted">Valuta:</span> {company.currency ?? 'SEK'}</div>
          </dl>
        </div>
        <div className="bg-white border-[1.5px] border-border rounded-card p-6">
          <h2 className="font-display font-bold text-base text-brown mb-3">Rakenskapsar</h2>
          <div className="space-y-2">
            {fys?.map(fy => (
              <div key={fy.id} className="text-sm text-text-body flex justify-between">
                <span>{fy.start_date} &mdash; {fy.end_date}</span>
                <span className="text-text-muted">
                  {fy.year_index === 0 ? 'Aktuellt' : `${fy.year_index}`}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
