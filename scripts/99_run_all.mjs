import { spawnSync } from 'node:child_process'
const steps = ['00_preflight.mjs','01_apply_schema.mjs','02_export_firebase.mjs','03_import_auth.mjs','04_import_firestore.mjs','05_import_storage.mjs','06_sync_profiles.mjs','07_validate.mjs']
for (const step of steps) {
  console.log(`\n===== ${step} =====`)
  const result = spawnSync(process.execPath, [`scripts/${step}`], { stdio: 'inherit', env: process.env })
  if (result.status !== 0) process.exit(result.status || 1)
}
console.log('\nMIGRACIÓN FINALIZADA Y VALIDADA.')
