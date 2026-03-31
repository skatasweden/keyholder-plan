'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

const kontoplaner = [
  {
    id: 'bas-2026-standard',
    name: 'BAS 2026 Standard',
    description: 'Full chart of accounts (~700 accounts). Most common choice.',
    accounts: '~700',
  },
  {
    id: 'bas-2026-k1',
    name: 'BAS 2026 K1',
    description: 'Simplified for sole proprietors and small businesses.',
    accounts: '~200',
  },
  {
    id: 'bas-2026-k2',
    name: 'BAS 2026 K2',
    description: 'For smaller limited companies (AB).',
    accounts: '~300',
  },
  {
    id: 'bas-2026-k3',
    name: 'BAS 2026 K3',
    description: 'For larger companies with full IFRS requirements.',
    accounts: '~500',
  },
]

interface KontoplanPickerProps {
  selected: string | null
  onSelect: (id: string) => void
}

export function KontoplanPicker({ selected, onSelect }: KontoplanPickerProps) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {kontoplaner.map((plan) => (
        <Card
          key={plan.id}
          className={cn(
            'cursor-pointer transition-colors',
            selected === plan.id
              ? 'border-blue-500 bg-blue-50'
              : 'hover:border-gray-400'
          )}
          onClick={() => onSelect(plan.id)}
        >
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{plan.name}</CardTitle>
            <CardDescription className="text-xs">{plan.accounts} accounts</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600">{plan.description}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
