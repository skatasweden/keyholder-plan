import { createTenantClient } from '@/lib/supabase/tenant-client'

export async function buildSystemPrompt(
  tenantUrl: string,
  tenantServiceKey: string
): Promise<string> {
  const tenant = createTenantClient(tenantUrl, tenantServiceKey)

  // Fetch company info
  const { data: company } = await tenant
    .from('company_info')
    .select('*')
    .limit(1)
    .single()

  // Fetch accounts
  const { data: accounts } = await tenant
    .from('accounts')
    .select('account_number, name, account_type')
    .order('account_number')

  // Fetch financial years
  const { data: years } = await tenant
    .from('financial_years')
    .select('*')
    .order('year_index', { ascending: false })

  // Fetch table info for schema context
  const { data: tables } = await tenant.rpc('execute_readonly_query', {
    sql: `
      SELECT table_name, column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public'
      ORDER BY table_name, ordinal_position
    `,
    row_limit: 500,
  })

  const companyName = company?.company_name || 'Unknown Company'
  const orgNumber = company?.org_number || ''

  const accountList = (accounts || [])
    .map((a) => `${a.account_number} ${a.name}`)
    .join('\n')

  const yearList = (years || [])
    .map(
      (y) =>
        `${y.start_date} to ${y.end_date}${y.year_index === 0 ? ' (current)' : ''}`
    )
    .join('\n')

  // Build schema description from table info
  let schemaDesc = ''
  if (tables && Array.isArray(tables)) {
    const grouped: Record<string, { column_name: string; data_type: string; is_nullable: string }[]> = {}
    for (const col of tables) {
      if (!grouped[col.table_name]) grouped[col.table_name] = []
      grouped[col.table_name].push(col)
    }
    schemaDesc = Object.entries(grouped)
      .map(
        ([table, cols]) =>
          `TABLE ${table}:\n${cols
            .map((c) => `  - ${c.column_name} (${c.data_type}${c.is_nullable === 'YES' ? ', nullable' : ''})`)
            .join('\n')}`
      )
      .join('\n\n')
  }

  return `You are an accounting assistant for ${companyName}${orgNumber ? ` (org nr: ${orgNumber})` : ''}.
You have access to the company's complete accounting data in a Supabase database.

DATABASE SCHEMA:
${schemaDesc}

CHART OF ACCOUNTS:
${accountList}

FINANCIAL YEARS:
${yearList}

RULES:
- Swedish accounting standards: BAS chart of accounts, K2/K3 regulations
- Every voucher MUST balance (total debit = total credit, sum of amounts = 0)
- VAT rates: 25%, 12%, 6%, 0% depending on account class
- Account classes: 1xxx = Assets, 2xxx = Liabilities, 3xxx = Revenue, 4xxx-7xxx = Expenses, 8xxx = Financial items
- Respond in Swedish unless the user writes in English
- Use execute_sql for read queries, execute_mutation for writes (requires user approval)
- Format monetary amounts with Swedish conventions: 1 234,56 kr
- Always verify account numbers exist before using them in vouchers

TOOLS:
You have access to these tools:
- execute_sql: Run SELECT queries against the database (read-only)
- execute_mutation: Propose INSERT/UPDATE/DELETE (requires user approval)
- generate_report: Generate balance or income reports
- deploy_edge_function: Create and deploy edge functions
- create_custom_page: Build custom dashboard pages`
}
