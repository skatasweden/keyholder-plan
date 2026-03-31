import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/control-plane'
import { decrypt } from '@/lib/crypto'
import { runSql } from '@/lib/supabase/provisioner'

export async function POST(req: Request) {
  const { customerId, statements } = await req.json()

  if (!customerId || !statements?.length) {
    return NextResponse.json({ error: 'Missing customerId or statements' }, { status: 400 })
  }

  const supabase = createServerSupabase()

  const { data: project } = await supabase
    .from('customer_projects')
    .select('supabase_project_ref, supabase_url, supabase_service_key_encrypted')
    .eq('customer_id', customerId)
    .single()

  if (!project) {
    return NextResponse.json({ error: 'No project found' }, { status: 404 })
  }

  // Validate: only allow INSERT, UPDATE, DELETE (no DROP, TRUNCATE, ALTER, etc.)
  const ALLOWED_KEYWORDS = /^\s*(INSERT|UPDATE|DELETE)\b/i
  const BLOCKED_KEYWORDS = /\b(DROP|TRUNCATE|ALTER|CREATE|GRANT|REVOKE)\b/i

  for (const sql of statements) {
    if (!ALLOWED_KEYWORDS.test(sql)) {
      return NextResponse.json(
        { error: `Statement must start with INSERT, UPDATE, or DELETE: ${sql.slice(0, 50)}...` },
        { status: 400 }
      )
    }
    if (BLOCKED_KEYWORDS.test(sql)) {
      return NextResponse.json(
        { error: `Blocked keyword detected in statement: ${sql.slice(0, 50)}...` },
        { status: 400 }
      )
    }
  }

  // Execute via Management API SQL endpoint (uses project ref, not service key directly)
  const results = []
  for (const sql of statements) {
    try {
      const data = await runSql(project.supabase_project_ref, sql)
      results.push({ sql: sql.slice(0, 100), success: true, data })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      results.push({ sql: sql.slice(0, 100), success: false, error: message })
    }
  }

  const allSucceeded = results.every((r) => r.success)
  return NextResponse.json(
    { results, allSucceeded },
    { status: allSucceeded ? 200 : 207 }
  )
}
