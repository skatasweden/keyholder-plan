import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/control-plane'
import {
  createProject,
  waitForProjectReady,
  getProjectKeys,
  deploySchema,
} from '@/lib/supabase/provisioner'
import { readFileSync } from 'fs'
import { join } from 'path'
import { encrypt } from '@/lib/crypto'
import { createTenantClient } from '@/lib/supabase/tenant-client'

export async function POST(req: Request) {
  const supabase = createServerSupabase()
  const { customerId, companyName, orgNumber, kontoplan } = await req.json()

  // Create job for progress tracking
  const { data: job } = await supabase
    .from('jobs')
    .insert({
      customer_id: customerId,
      job_type: 'provision',
      status: 'running',
      started_at: new Date().toISOString(),
      progress_pct: 0,
      progress_message: 'Creating database...',
    })
    .select('id')
    .single()

  const jobId = job!.id

  try {
    // 1. Create Supabase project
    const projectName = `kh-${orgNumber || customerId.slice(0, 8)}`
    const project = await createProject(projectName)

    await supabase
      .from('jobs')
      .update({ progress_pct: 20, progress_message: 'Waiting for database...' })
      .eq('id', jobId)

    // 2. Wait for project to be ready
    await waitForProjectReady(project.ref)

    await supabase
      .from('jobs')
      .update({ progress_pct: 40, progress_message: 'Deploying schema...' })
      .eq('id', jobId)

    // 3. Deploy tenant schema
    const schemaPath = join(
      process.cwd(),
      'packages/tenant-template/migrations/001_full_schema.sql'
    )
    const schemaSql = readFileSync(schemaPath, 'utf-8')
    await deploySchema(project.ref, schemaSql)

    await supabase
      .from('jobs')
      .update({ progress_pct: 60, progress_message: 'Getting access keys...' })
      .eq('id', jobId)

    // 4. Get keys
    const keys = await getProjectKeys(project.ref)

    // 5. Store tenant metadata
    await supabase.from('customer_projects').insert({
      customer_id: customerId,
      supabase_project_ref: project.ref,
      supabase_url: keys.url,
      supabase_anon_key: keys.anonKey,
      supabase_service_key_encrypted: encrypt(keys.serviceRoleKey),
      status: 'active',
    })

    // 6. Grant initial credits
    await supabase.from('credit_balances').upsert({
      customer_id: customerId,
      credits_remaining: 20,
      plan_credits_monthly: 20,
      next_reset_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    })

    await supabase.from('credit_transactions').insert({
      customer_id: customerId,
      amount: 20,
      reason: 'initial_grant',
    })

    // 7. Seed kontoplan if selected
    if (kontoplan) {
      await supabase
        .from('jobs')
        .update({ progress_pct: 80, progress_message: 'Seeding chart of accounts...' })
        .eq('id', jobId)

      const seedPath = join(process.cwd(), `packages/tenant-template/seed/${kontoplan}.json`)
      const seedData = JSON.parse(readFileSync(seedPath, 'utf-8'))
      const tenantClient = createTenantClient(keys.url, keys.serviceRoleKey)

      // Seed company info
      const { data: companyRow } = await tenantClient.from('company_info').insert({
        company_name: companyName,
        org_number: orgNumber,
        currency: 'SEK',
      }).select('id').single()

      const companyId = companyRow?.id

      if (companyId) {
        // Seed current financial year
        const now = new Date()
        await tenantClient.from('financial_years').insert({
          company_id: companyId,
          year_index: 0,
          start_date: `${now.getFullYear()}-01-01`,
          end_date: `${now.getFullYear()}-12-31`,
        })

        // Insert accounts in chunks of 500
        const accounts = seedData.accounts.map((a: { account_number: number; name: string; account_type: string }) => ({
          company_id: companyId,
          account_number: a.account_number,
          name: a.name,
          account_type: a.account_type,
        }))

        for (let i = 0; i < accounts.length; i += 500) {
          await tenantClient.from('accounts').insert(accounts.slice(i, i + 500))
        }
      }
    }

    // 8. Mark job complete
    await supabase
      .from('jobs')
      .update({
        status: 'completed',
        progress_pct: 100,
        progress_message: 'Done!',
        completed_at: new Date().toISOString(),
      })
      .eq('id', jobId)

    return NextResponse.json({ jobId, projectRef: project.ref })
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
