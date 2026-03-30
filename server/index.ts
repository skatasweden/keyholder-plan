import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serve } from '@hono/node-server'
import { createClient } from '@supabase/supabase-js'
import { parseSIE4 } from '../src/sie4-parser.js'
import { importToSupabase } from '../src/sie4-importer.js'

const app = new Hono()

app.use('/*', cors({ origin: ['http://localhost:5173'] }))

const supabase = createClient(
  process.env.SUPABASE_URL ?? 'http://127.0.0.1:54421',
  process.env.SUPABASE_SERVICE_KEY ?? ''
)

app.post('/api/import', async (c) => {
  const body = await c.req.parseBody()
  const file = body['file']
  if (!(file instanceof File)) {
    return c.json({ error: 'No file uploaded' }, 400)
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const start = Date.now()

  try {
    const parsed = parseSIE4(buffer)
    const result = await importToSupabase(parsed, supabase)
    return c.json({ ...result, duration_ms: Date.now() - start })
  } catch (err) {
    return c.json({ error: String(err) }, 500)
  }
})

app.post('/api/validate/fortnox', async (c) => {
  const body = await c.req.parseBody()
  const file = body['file']
  if (!(file instanceof File)) {
    return c.json({ error: 'No file uploaded' }, 400)
  }

  const html = await file.text()
  try {
    const parser = await import('../src/fortnox-html-parser.js')

    // Auto-detect report type
    if (html.includes('Balansrapport')) {
      return c.json({ type: 'balans', data: parser.parseBalansHtml(html) })
    } else if (html.includes('Resultatrapport')) {
      return c.json({ type: 'resultat', data: parser.parseResultatHtml(html) })
    } else if (html.includes('Huvudbok')) {
      return c.json({ type: 'huvudbok', data: parser.parseHuvudbokHtml(html) })
    } else if (html.includes('Verifikationslista')) {
      return c.json({ type: 'verifikationslista', data: parser.parseVerifikationslistaHtml(html) })
    }
    return c.json({ error: 'Could not detect report type' }, 400)
  } catch (err) {
    return c.json({ error: String(err) }, 500)
  }
})

serve({ fetch: app.fetch, port: 3003 }, () => {
  console.log('Import server running on http://localhost:3003')
})
