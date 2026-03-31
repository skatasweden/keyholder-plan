'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { AlertTriangle } from 'lucide-react'

interface MutationConfirmProps {
  description: string
  statements: string[]
  validationNotes?: string
  onApprove: () => void
  onCancel: () => void
}

export function MutationConfirm({
  description,
  statements,
  validationNotes,
  onApprove,
  onCancel,
}: MutationConfirmProps) {
  return (
    <Card className="my-2 border-amber-200 bg-amber-50">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <CardTitle className="text-sm text-amber-800">
            Mutation requires approval
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-sm">{description}</p>
        {statements.map((stmt, i) => (
          <pre
            key={i}
            className="rounded bg-white p-2 text-xs overflow-x-auto border"
          >
            {stmt}
          </pre>
        ))}
        {validationNotes && (
          <p className="text-xs text-gray-500">{validationNotes}</p>
        )}
      </CardContent>
      <CardFooter className="gap-2 pt-0">
        <Button size="sm" onClick={onApprove}>
          Approve
        </Button>
        <Button size="sm" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </CardFooter>
    </Card>
  )
}
