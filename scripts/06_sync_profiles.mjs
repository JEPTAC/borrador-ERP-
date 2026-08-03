import { adminClient } from './lib/supabase.mjs'
const supabase = adminClient()
const { data, error } = await supabase.rpc('refresh_migrated_profiles')
if (error) throw error
console.log(JSON.stringify({ profilesUpserted: data }, null, 2))
