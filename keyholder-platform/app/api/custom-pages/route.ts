import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/control-plane'
import { createTenantClient } from '@/lib/supabase/tenant-client'
import { decrypt } from '@/lib/crypto'

export async function POST(req: Request) {
  const { customerId, title, slug, description, component_code, icon } =
    await req.json()

  const supabase = createServerSupabase()

  const { data: project } = await supabase
    .from('customer_projects')
    .select('supabase_url, supabase_service_key_encrypted')
    .eq('customer_id', customerId)
    .single()

  if (!project) {
    return NextResponse.json({ error: 'No project found' }, { status: 404 })
  }

  const tenant = createTenantClient(
    project.supabase_url,
    decrypt(project.supabase_service_key_encrypted)
  )

  const { data, error } = await tenant.from('custom_pages').upsert(
    { title, slug, description, component_code, icon },
    { onConflict: 'slug' }
  ).select().single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const customerId = searchParams.get('customerId')

  if (!customerId) {
    return NextResponse.json({ error: 'Missing customerId' }, { status: 400 })
  }

  const supabase = createServerSupabase()

  const { data: project } = await supabase
    .from('customer_projects')
    .select('supabase_url, supabase_service_key_encrypted')
    .eq('customer_id', customerId)
    .single()

  if (!project) {
    return NextResponse.json({ error: 'No project found' }, { status: 404 })
  }

  const tenant = createTenantClient(
    project.supabase_url,
    decrypt(project.supabase_service_key_encrypted)
  )

  const { data, error } = await tenant
    .from('custom_pages')
    .select('slug, title, description, icon, sort_order')
    .order('sort_order')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}
