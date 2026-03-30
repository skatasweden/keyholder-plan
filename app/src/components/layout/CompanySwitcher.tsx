import { useCompanies } from '@/hooks/useCompanies'
import { useNavigate, useParams } from 'react-router-dom'

export function CompanySwitcher() {
  const { companyId } = useParams()
  const { data: companies } = useCompanies()
  const navigate = useNavigate()

  return (
    <div className="px-5 py-4 border-b border-border">
      <div className="font-display font-black text-lg text-brown tracking-tight">
        KEYHOLDER
      </div>
      <select
        value={companyId ?? ''}
        onChange={e => {
          if (e.target.value) navigate(`/company/${e.target.value}`)
          else navigate('/import')
        }}
        className="mt-3 w-full px-3 py-2.5 bg-bg rounded-[10px] border-none
          text-sm font-medium text-brown cursor-pointer
          focus:outline-none focus:ring-2 focus:ring-accent/30"
      >
        {!companyId && <option value="">Valj foretag...</option>}
        {companies?.map(c => (
          <option key={c.id} value={c.id}>
            {c.company_name} ({c.org_number})
          </option>
        ))}
      </select>
    </div>
  )
}
