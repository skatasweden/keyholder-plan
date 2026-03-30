import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { queryKeys } from '@/lib/query-keys'
import { parseNumeric } from '@/lib/format'

export interface DimensionObj {
  object_number: string
  name: string
  opening_balance: number
  closing_balance: number
}

export interface Dimension {
  id: string
  dimension_number: number
  name: string
  parent_dimension: number | null
  objects: DimensionObj[]
}

export function useDimensions(companyId: string | undefined, fyId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.dimensions.byCompany(companyId!),
    queryFn: async () => {
      // Fetch dimensions
      const { data: dims, error: dimErr } = await supabase
        .from('dimensions')
        .select('id, dimension_number, name, parent_dimension')
        .eq('company_id', companyId!)
        .order('dimension_number')
      if (dimErr) throw dimErr

      // Fetch objects
      const { data: objs, error: objErr } = await supabase
        .from('objects')
        .select('dimension_number, object_number, name')
        .eq('company_id', companyId!)
        .order('object_number')
      if (objErr) throw objErr

      // Fetch object-level balances if we have a FY
      const ibMap = new Map<string, number>()
      const ubMap = new Map<string, number>()
      if (fyId) {
        const { data: ibs } = await supabase
          .from('opening_balances')
          .select('dimension_number, object_number, amount')
          .eq('financial_year_id', fyId)
          .not('dimension_number', 'is', null)
        for (const ib of ibs ?? []) {
          ibMap.set(`${ib.dimension_number}:${ib.object_number}`, parseNumeric(ib.amount))
        }

        const { data: ubs } = await supabase
          .from('closing_balances')
          .select('dimension_number, object_number, amount')
          .eq('financial_year_id', fyId)
          .not('dimension_number', 'is', null)
        for (const ub of ubs ?? []) {
          ubMap.set(`${ub.dimension_number}:${ub.object_number}`, parseNumeric(ub.amount))
        }
      }

      // Group objects by dimension
      const objsByDim = new Map<number, DimensionObj[]>()
      for (const o of objs ?? []) {
        const key = `${o.dimension_number}:${o.object_number}`
        const obj: DimensionObj = {
          object_number: o.object_number,
          name: o.name,
          opening_balance: ibMap.get(key) ?? 0,
          closing_balance: ubMap.get(key) ?? 0,
        }
        const arr = objsByDim.get(o.dimension_number) ?? []
        arr.push(obj)
        objsByDim.set(o.dimension_number, arr)
      }

      return (dims ?? []).map(d => ({
        ...d,
        objects: objsByDim.get(d.dimension_number) ?? [],
      })) as Dimension[]
    },
    enabled: !!companyId,
  })
}
