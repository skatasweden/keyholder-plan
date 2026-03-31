import { tool } from 'ai'
import { z } from 'zod'
import { createTenantClient } from '@/lib/supabase/tenant-client'

const BLOCKED_KEYWORDS = /\b(DROP|DELETE|TRUNCATE|ALTER|CREATE|INSERT|UPDATE|GRANT|REVOKE)\b/i

export function buildTools(tenantUrl: string, tenantServiceKey: string) {
  const tenant = createTenantClient(tenantUrl, tenantServiceKey)

  return {
    execute_sql: tool({
      description:
        'Execute a read-only SELECT query against the accounting database. Returns rows as JSON. Max 1000 rows.',
      inputSchema: z.object({
        query: z.string().describe('The SELECT SQL query to execute'),
      }),
      execute: async ({ query }) => {
        const trimmed = query.trim()

        if (!trimmed.toUpperCase().startsWith('SELECT')) {
          return { error: 'Only SELECT queries are allowed' }
        }

        if (BLOCKED_KEYWORDS.test(trimmed)) {
          return { error: 'Query contains blocked keywords' }
        }

        const { data, error } = await tenant.rpc('execute_readonly_query', {
          sql: trimmed,
          row_limit: 1000,
        })

        if (error) {
          return { error: error.message }
        }

        const rows = Array.isArray(data) ? data : []
        return { rows, count: rows.length }
      },
    }),

    execute_mutation: tool({
      description:
        'Propose a write operation (INSERT/UPDATE/DELETE) that requires user approval before execution. Returns the proposed SQL for the user to review.',
      inputSchema: z.object({
        description: z.string().describe('Human-readable description of what this mutation does'),
        statements: z
          .array(z.string())
          .describe('Array of SQL statements to execute if approved'),
        validation_notes: z
          .string()
          .optional()
          .describe('Notes about validation performed (e.g., voucher balances)'),
      }),
      execute: async ({ description, statements, validation_notes }) => {
        return {
          status: 'pending_approval' as const,
          description,
          statements,
          validation_notes,
          message:
            'This mutation requires your approval. Please review the changes above and click Approve or Cancel.',
        }
      },
    }),

    generate_report: tool({
      description:
        'Generate a formatted accounting report (balance sheet or income statement).',
      inputSchema: z.object({
        report_type: z
          .enum(['balansrapport', 'resultatrapport'])
          .describe('Type of report to generate'),
        financial_year_index: z
          .number()
          .default(0)
          .describe('Financial year index (0 = current, -1 = previous)'),
      }),
      execute: async ({ report_type, financial_year_index }) => {
        const funcName =
          report_type === 'balansrapport'
            ? 'report_balansrapport'
            : 'report_resultatrapport'

        const { data, error } = await tenant.rpc(funcName, {
          year_index: financial_year_index,
        })

        if (error) {
          return { error: error.message }
        }

        return { report_type, data }
      },
    }),

    deploy_edge_function: tool({
      description:
        'Create and deploy an edge function to the customer Supabase project. Returns code for user approval before deploying.',
      inputSchema: z.object({
        name: z.string().describe('Function name (slug format, e.g., "invoice-checker")'),
        description: z.string().describe('What this function does'),
        code: z.string().describe('TypeScript/Deno edge function source code'),
        schedule: z
          .string()
          .optional()
          .describe('Optional cron schedule (e.g., "0 9 * * 1" for every Monday 9am)'),
      }),
      execute: async ({ name, description, code, schedule }) => {
        return {
          status: 'pending_approval' as const,
          name,
          description,
          code,
          schedule,
          message:
            'This edge function needs your approval before deployment. Review the code above.',
        }
      },
    }),

    create_custom_page: tool({
      description:
        'Create a custom dashboard page with React + Tailwind + Recharts. Returns the component code for user approval.',
      inputSchema: z.object({
        title: z.string().describe('Page title shown in sidebar'),
        slug: z
          .string()
          .describe('URL slug (e.g., "cash-flow-forecast")'),
        description: z.string().describe('What this page does'),
        component_code: z.string().describe('React TSX component code'),
        icon: z
          .string()
          .default('file-text')
          .describe('Lucide icon name for sidebar'),
      }),
      execute: async ({ title, slug, description, component_code, icon }) => {
        return {
          status: 'pending_approval' as const,
          title,
          slug,
          description,
          component_code,
          icon,
          message:
            'This custom page needs your approval before saving. Review the component code above.',
        }
      },
    }),
  }
}
