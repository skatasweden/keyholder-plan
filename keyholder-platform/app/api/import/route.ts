import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/control-plane'
import { createTenantClient } from '@/lib/supabase/tenant-client'
import { decrypt } from '@/lib/crypto'

export async function POST(req: Request) {
  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const customerId = formData.get('customerId') as string

  if (!file || !customerId) {
    return NextResponse.json({ error: 'Missing file or customerId' }, { status: 400 })
  }

  const supabase = createServerSupabase()

  // Get tenant project info
  const { data: project } = await supabase
    .from('customer_projects')
    .select('*')
    .eq('customer_id', customerId)
    .single()

  if (!project) {
    return NextResponse.json({ error: 'No project found' }, { status: 404 })
  }

  // Create job
  const { data: job } = await supabase
    .from('jobs')
    .insert({
      customer_id: customerId,
      job_type: 'sie_import',
      status: 'running',
      started_at: new Date().toISOString(),
      progress_pct: 0,
      progress_message: 'Parsing SIE4 file...',
    })
    .select('id')
    .single()

  const jobId = job!.id

  try {
    const buffer = Buffer.from(await file.arrayBuffer())

    // Dynamic import to avoid bundling issues
    const { parseSIE4, importToSupabase } = await import('@keyholder/sie-parser')

    await supabase
      .from('jobs')
      .update({ progress_pct: 20, progress_message: 'Parsing complete. Importing data...' })
      .eq('id', jobId)

    const parsed = parseSIE4(buffer)

    const tenantClient = createTenantClient(
      project.supabase_url,
      decrypt(project.supabase_service_key_encrypted)
    )

    await supabase
      .from('jobs')
      .update({ progress_pct: 40, progress_message: `Importing ${parsed.accounts.length} accounts...` })
      .eq('id', jobId)

    const result = await importToSupabase(parsed, tenantClient)

    await supabase
      .from('jobs')
      .update({
        status: 'completed',
        progress_pct: 100,
        progress_message: `Done! Imported ${result.stats.accounts} accounts, ${result.stats.vouchers} vouchers.`,
        completed_at: new Date().toISOString(),
      })
      .eq('id', jobId)

    return NextResponse.json({ jobId, result })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    await supabase
      .from('jobs')
      .update({
        status: 'failed',
        error_message: message,
        completed_at: new Date().toISOString(),
      })
      .eq('id', jobId)

    return NextResponse.json({ error: message }, { status: 500 })
  }
}
