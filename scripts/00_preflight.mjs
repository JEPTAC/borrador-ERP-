import fs from 'node:fs'
import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'
import { required, optional, baseUrl } from './lib/env.mjs'
import { adminClient } from './lib/supabase.mjs'

const servicePath = required('FIREBASE_SERVICE_ACCOUNT_PATH')
if (!fs.existsSync(servicePath)) throw new Error(`No existe ${servicePath}`)
const account = JSON.parse(fs.readFileSync(servicePath, 'utf8'))
if (account.project_id !== required('FIREBASE_PROJECT_ID')) throw new Error('El project_id de la cuenta de servicio no coincide con FIREBASE_PROJECT_ID')
if (!getApps().length) initializeApp({ credential: cert(account) })

const checks = []
await getFirestore().listCollections().then(v => checks.push({ firebaseFirestore: 'ok', rootCollections: v.length }))
await getAuth().listUsers(1).then(v => checks.push({ firebaseAuth: 'ok', sampleUsers: v.users.length }))
const supabase = adminClient()
const { data: users, error: authError } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1 })
if (authError) throw new Error(`Supabase Auth: ${authError.message}`)
checks.push({ supabaseAuthAdmin: 'ok', existingUsersSample: users?.users?.length || 0 })
const { error: tableError } = await supabase.from('firestore_documents').select('document_path', { head: true, count: 'exact' }).limit(1)
checks.push({ schemaReady: !tableError, schemaMessage: tableError?.message || 'ok' })
console.log(JSON.stringify({ status: 'ok', firebaseProject: account.project_id, supabaseUrl: baseUrl(), dbUrlConfigured: Boolean(optional('SUPABASE_DB_URL')), checks }, null, 2))
