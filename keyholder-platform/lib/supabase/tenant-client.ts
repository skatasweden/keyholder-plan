import { createClient, SupabaseClient } from '@supabase/supabase-js'

export function createTenantClient(
  supabaseUrl: string,
  supabaseServiceKey: string
): SupabaseClient {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
