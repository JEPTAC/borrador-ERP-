import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { optional, bool } from './lib/env.mjs'
import { read } from './lib/jsonl.mjs'
import { adminClient } from './lib/supabase.mjs'

const exportDir = path.resolve(optional('EXPORT_DIR', './exports/firebase'))
const source = path.join(exportDir, 'auth-users.jsonl.gz')
if (!fs.existsSync(source)) throw new Error(`No existe ${source}`)
const mode = optional('AUTH_MODE', 'create_and_reset')
const sendReset = bool('SEND_RESET_EMAILS', false)
const dryRun = bool('DRY_RUN', false)
const supabase = adminClient()
let created = 0, existing = 0, failed = 0, resetRequested = 0

async function findByEmail(email) {
  let page = 1
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw error
    const found = (data.users || []).find(u => u.email?.toLowerCase() === email.toLowerCase())
    if (found) return found
    if ((data.users || []).length < 1000) return null
    page++
  }
}

for await (const user of read(source)) {
  if (!user.email && !user.phoneNumber) { failed++; continue }
  try {
    const current = user.email ? await findByEmail(user.email) : null
    if (current) { existing++; continue }
    const providers = [...new Set((user.providerData || []).map(p => String(p.providerId || '').replace('.com', '')).filter(Boolean))]
    const attributes = {
      email: user.email || undefined,
      phone: user.phoneNumber || undefined,
      email_confirm: Boolean(user.emailVerified),
      phone_confirm: Boolean(user.phoneNumber),
      user_metadata: {
        firebase_uid: user.uid,
        display_name: user.displayName || null,
        photo_url: user.photoURL || null,
        firebase_custom_claims: user.customClaims || {},
        firebase_providers: providers,
        must_reset_password: providers.includes('password') || Boolean(user.passwordHash),
        migrated_from: 'firebase'
      },
      app_metadata: { firebase_uid: user.uid, providers }
    }
    if (user.disabled) attributes.ban_duration = '876000h'
    if (attributes.user_metadata.must_reset_password) attributes.password = crypto.randomBytes(36).toString('base64url')
    if (!dryRun) {
      const { error } = await supabase.auth.admin.createUser(attributes)
      if (error) throw error
      if (sendReset && user.email && attributes.user_metadata.must_reset_password && mode === 'create_and_reset') {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(user.email)
        if (!resetError) resetRequested++
      }
    }
    created++
  } catch (error) {
    failed++
    console.error(`AUTH ${user.uid || user.email}: ${error.message}`)
  }
}
console.log(JSON.stringify({ mode, dryRun, created, existing, failed, resetRequested, note: 'Los UID de Firebase quedan preservados en metadata/perfiles. Las contraseñas de Firebase no pueden trasladarse mediante Admin API; los usuarios de contraseña deben restablecerla o usar Firebase Third-party Auth durante la transición.' }, null, 2))
if (failed) process.exitCode = 2
