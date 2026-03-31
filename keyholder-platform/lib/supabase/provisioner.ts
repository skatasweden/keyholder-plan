const SUPABASE_API = 'https://api.supabase.com'

interface CreateProjectResponse {
  id: string
  ref: string
  name: string
  region: string
  status: string
  organization_slug: string
  created_at: string
}

interface ServiceHealth {
  name: string
  status: 'COMING_UP' | 'ACTIVE_HEALTHY' | 'UNHEALTHY'
}

interface ApiKey {
  api_key: string | null
  name: string
  type: string | null
}

function getHeaders() {
  return {
    Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`,
    'Content-Type': 'application/json',
  }
}

export async function createProject(name: string): Promise<CreateProjectResponse> {
  const res = await fetch(`${SUPABASE_API}/v1/projects`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({
      name,
      organization_slug: process.env.SUPABASE_ORG_SLUG,
      db_pass: crypto.randomUUID() + crypto.randomUUID(),
      region_selection: { type: 'specific', code: 'eu-central-1' },
      desired_instance_size: 'micro',
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Failed to create project: ${res.status} ${body}`)
  }

  return res.json()
}

export async function waitForProjectReady(
  ref: string,
  maxWaitMs = 120_000
): Promise<void> {
  const start = Date.now()

  while (Date.now() - start < maxWaitMs) {
    const res = await fetch(
      `${SUPABASE_API}/v1/projects/${ref}/health`,
      { headers: getHeaders() }
    )

    if (res.ok) {
      const services: ServiceHealth[] = await res.json()
      const allHealthy = services.every((s) => s.status === 'ACTIVE_HEALTHY')
      if (allHealthy) return
    }

    await new Promise((r) => setTimeout(r, 5000))
  }

  throw new Error(`Project ${ref} did not become healthy within ${maxWaitMs}ms`)
}

export async function getProjectKeys(ref: string): Promise<{
  anonKey: string
  serviceRoleKey: string
  url: string
}> {
  const res = await fetch(
    `${SUPABASE_API}/v1/projects/${ref}/api-keys?reveal=true`,
    { headers: getHeaders() }
  )

  if (!res.ok) throw new Error(`Failed to get keys: ${res.status}`)

  const keys: ApiKey[] = await res.json()
  const anon = keys.find((k) => k.name === 'anon' || k.type === 'publishable')
  const service = keys.find((k) => k.name === 'service_role' || k.type === 'secret')

  if (!anon?.api_key || !service?.api_key) {
    throw new Error('Could not find anon or service_role key')
  }

  return {
    anonKey: anon.api_key,
    serviceRoleKey: service.api_key,
    url: `https://${ref}.supabase.co`,
  }
}

export async function runSql(ref: string, query: string): Promise<unknown> {
  const res = await fetch(
    `${SUPABASE_API}/v1/projects/${ref}/database/query`,
    {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ query }),
    }
  )

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`SQL failed: ${res.status} ${body}`)
  }

  return res.json()
}

export async function deploySchema(ref: string, sql: string): Promise<void> {
  await runSql(ref, sql)
}

export async function deployEdgeFunction(
  ref: string,
  slug: string,
  code: string
): Promise<void> {
  const metadata = JSON.stringify({
    name: slug,
    verify_jwt: false,
  })

  const formData = new FormData()
  formData.append('metadata', new Blob([metadata], { type: 'application/json' }))
  formData.append('file', new Blob([code], { type: 'application/typescript' }), 'index.ts')

  const res = await fetch(
    `${SUPABASE_API}/v1/projects/${ref}/functions/deploy?slug=${slug}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`,
      },
      body: formData,
    }
  )

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Deploy EF failed: ${res.status} ${body}`)
  }
}
