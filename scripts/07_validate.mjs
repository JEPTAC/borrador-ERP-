import fs from 'node:fs'
import path from 'node:path'
import { optional } from './lib/env.mjs'
import { adminClient } from './lib/supabase.mjs'
const exportDir = path.resolve(optional('EXPORT_DIR', './exports/firebase'))
const manifest = JSON.parse(fs.readFileSync(path.join(exportDir, 'manifest.json'), 'utf8'))
const supabase = adminClient()
const count = async table => {
  const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true })
  if (error) throw error
  return count || 0
}
const firestore = await count('firestore_documents')
const storage = await count('storage_migration_map')
const profiles = await count('profiles')
let auth = 0, page = 1
for (;;) {
  const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 })
  if (error) throw error
  auth += data.users.length
  if (data.users.length < 1000) break
  page++
}
const result = {
  source: { firestore: manifest.firestoreDocuments, auth: manifest.authUsers, storage: manifest.storageObjects },
  target: { firestore, auth, profiles, storage },
  exact: { firestore: firestore === manifest.firestoreDocuments, storage: storage === manifest.storageObjects },
  authNote: 'El total de Auth puede incluir usuarios preexistentes; valide además profiles.firebase_uid.'
}
fs.writeFileSync(path.join(exportDir, 'validation-report.json'), JSON.stringify(result, null, 2))
console.log(JSON.stringify(result, null, 2))
if (!result.exact.firestore || !result.exact.storage) process.exitCode = 2
