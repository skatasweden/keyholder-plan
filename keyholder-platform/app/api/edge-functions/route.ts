import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/control-plane'
import { deployEdgeFunction } from '@/lib/supabase/provisioner'

export async function POST(req: Request) {
  const { customerId, slug, code } = await req.json()

  const supabase = createServerSupabase()

  const { data: project } = await supabase
    .from('customer_projects')
    .select('supabase_project_ref')
    .eq('customer_id', customerId)
    .single()

  if (!project) {
    return NextResponse.json({ error: 'No project found' }, { status: 404 })
  }

  try {
    await deployEdgeFunction(project.supabase_project_ref, slug, code)
    return NextResponse.json({ success: true, slug })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Deploy failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
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
    .select('supabase_project_ref')
    .eq('customer_id', customerId)
    .single()

  if (!project) {
    return NextResponse.json({ error: 'No project found' }, { status: 404 })
  }

  // List edge functions via Management API
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${project.supabase_project_ref}/functions`,
    {
      headers: {
        Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`,
      },
    }
  )

  if (!res.ok) {
    return NextResponse.json({ error: 'Failed to list functions' }, { status: 500 })
  }

  const functions = await res.json()
  return NextResponse.json(functions)
}
