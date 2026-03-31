'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ChevronDown, ChevronRight, Database, FileCode, BarChart3, Zap, Layout } from 'lucide-react'
import { cn } from '@/lib/utils'

const toolIcons: Record<string, typeof Database> = {
  execute_sql: Database,
  execute_mutation: FileCode,
  generate_report: BarChart3,
  deploy_edge_function: Zap,
  create_custom_page: Layout,
}

const toolLabels: Record<string, string> = {
  execute_sql: 'SQL Query',
  execute_mutation: 'Mutation',
  generate_report: 'Report',
  deploy_edge_function: 'Edge Function',
  create_custom_page: 'Custom Page',
}

interface ToolCallCardProps {
  toolName: string
  args: Record<string, unknown>
  result?: unknown
  state: string
}

export function ToolCallCard({ toolName, args, result, state }: ToolCallCardProps) {
  const [expanded, setExpanded] = useState(false)
  const Icon = toolIcons[toolName] || Database
  const label = toolLabels[toolName] || toolName

  return (
    <Card className="my-2">
      <CardHeader
        className="cursor-pointer py-2 px-3"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          {expanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
          <Icon className="h-4 w-4" />
          <CardTitle className="text-sm">{label}</CardTitle>
          <Badge
            variant={state === 'result' ? 'default' : 'secondary'}
            className="ml-auto text-xs"
          >
            {state === 'result' ? 'Done' : state === 'call' ? 'Running...' : 'Preparing...'}
          </Badge>
        </div>
      </CardHeader>
      {expanded ? (
        <CardContent className="px-3 pb-3 pt-0">
          {'query' in args && toolName === 'execute_sql' ? (
            <pre className="rounded bg-gray-100 p-2 text-xs overflow-x-auto">
              {String(args.query)}
            </pre>
          ) : null}
          {'description' in args && toolName === 'execute_mutation' ? (
            <p className="text-sm text-gray-600">{String(args.description)}</p>
          ) : null}
          {result != null ? (
            <div className="mt-2">
              <p className="text-xs font-medium text-gray-500 mb-1">Result:</p>
              <pre className="rounded bg-gray-50 p-2 text-xs overflow-x-auto max-h-60">
                {JSON.stringify(result, null, 2)}
              </pre>
            </div>
          ) : null}
        </CardContent>
      ) : null}
    </Card>
  )
}
