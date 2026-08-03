import { createClient } from '@supabase/supabase-js'
import { baseUrl, required } from './env.mjs'

export function adminClient() {
  const key = required('SUPABASE_SERVICE_ROLE_KEY')
  if (key.startsWith('sb_publishable_')) throw new Error('Se requiere secret key o service_role; la publishable key no sirve para migración')
  return createClient(baseUrl(), key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { 'X-Client-Info': 'ei-erp-migration/2.0' } }
  })
}
