'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { createBrowserSupabase } from '@/lib/supabase/control-plane'
import { createTenantClient } from '@/lib/supabase/tenant-client'
import { Loader2 } from 'lucide-react'

export default function CustomPageRenderer() {
  const params = useParams()
  const slug = params.slug as string
  const [html, setHtml] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function loadPage() {
      const supabase = createBrowserSupabase()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: customer } = await supabase
        .from('customers')
        .select('id')
        .eq('auth_user_id', user.id)
        .single()

      if (!customer) {
        setError('No workspace found')
        setLoading(false)
        return
      }

      // Get tenant project info
      const { data: project } = await supabase
        .from('customer_projects')
        .select('supabase_url, supabase_anon_key')
        .eq('customer_id', customer.id)
        .single()

      if (!project) {
        setError('No project found')
        setLoading(false)
        return
      }

      // Fetch custom page from tenant DB using anon key (read-only)
      const tenant = createTenantClient(project.supabase_url, project.supabase_anon_key)
      const { data: page, error: pageError } = await tenant
        .from('custom_pages')
        .select('component_code, title')
        .eq('slug', slug)
        .single()

      if (pageError || !page) {
        setError('Page not found')
        setLoading(false)
        return
      }

      // Build sandboxed HTML for iframe
      const sandboxHtml = buildSandboxHtml(
        page.component_code,
        page.title,
        project.supabase_url,
        project.supabase_anon_key
      )
      setHtml(sandboxHtml)
      setLoading(false)
    }
    loadPage()
  }, [slug])

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-red-500">{error}</p>
      </div>
    )
  }

  return (
    <iframe
      srcDoc={html!}
      sandbox="allow-scripts"
      className="h-full w-full border-0"
      title={`Custom page: ${slug}`}
    />
  )
}

function buildSandboxHtml(
  componentCode: string,
  title: string,
  supabaseUrl: string,
  supabaseAnonKey: string
): string {
  return `<!DOCTYPE html>
<html lang="sv">
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <script src="https://cdn.tailwindcss.com"><\/script>
  <script crossorigin src="https://unpkg.com/react@19/umd/react.production.min.js"><\/script>
  <script crossorigin src="https://unpkg.com/react-dom@19/umd/react-dom.production.min.js"><\/script>
  <script crossorigin src="https://unpkg.com/recharts@2/umd/Recharts.js"><\/script>
  <script src="https://unpkg.com/@supabase/supabase-js@2/dist/umd/supabase.min.js"><\/script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"><\/script>
  <style>
    body { margin: 0; padding: 16px; font-family: system-ui, sans-serif; }
  </style>
</head>
<body>
  <div id="root"></div>
  <script type="text/babel">
    const { useState, useEffect, useCallback, useMemo } = React;
    const { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid, Area, AreaChart } = Recharts;

    const supabase = window.supabase.createClient(
      "${supabaseUrl}",
      "${supabaseAnonKey}"
    );

    ${componentCode}

    const App = typeof module !== 'undefined' && module.exports
      ? module.exports
      : (typeof CustomPage !== 'undefined' ? CustomPage : null);

    if (App) {
      const root = ReactDOM.createRoot(document.getElementById('root'));
      root.render(React.createElement(App, { supabase }));
    }
  <\/script>
</body>
</html>`
}
