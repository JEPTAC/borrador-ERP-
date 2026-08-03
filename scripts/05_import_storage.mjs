import fs from 'node:fs'
import path from 'node:path'
import mime from 'mime-types'
import { optional, bool } from './lib/env.mjs'
import { read } from './lib/jsonl.mjs'
import { adminClient } from './lib/supabase.mjs'

const exportDir = path.resolve(optional('EXPORT_DIR', './exports/firebase'))
const source = path.join(exportDir, 'storage-manifest.jsonl.gz')
if (!fs.existsSync(source)) throw new Error(`No existe ${source}`)
const bucketName = optional('SUPABASE_STORAGE_BUCKET', 'erp-private')
const dryRun = bool('DRY_RUN', false)
const supabase = adminClient()
if (!dryRun) {
  const { data, error } = await supabase.storage.listBuckets()
  if (error) throw error
  if (!(data || []).some(b => b.name === bucketName)) {
    const { error: createError } = await supabase.storage.createBucket(bucketName, { public: false, fileSizeLimit: 52428800 })
    if (createError) throw createError
  }
}
let imported = 0, failed = 0
for await (const item of read(source)) {
  try {
    const local = path.join(exportDir, item.localPath)
    if (!fs.existsSync(local)) throw new Error(`Falta ${local}`)
    if (!dryRun) {
      const contentType = item.metadata?.contentType || mime.lookup(item.sourcePath) || 'application/octet-stream'
      const { error } = await supabase.storage.from(bucketName).upload(item.sourcePath, fs.readFileSync(local), { upsert: true, contentType, cacheControl: item.metadata?.cacheControl || '3600', metadata: { firebase: item.metadata || {}, sourceSha256: item.sha256 } })
      if (error) throw error
      const { error: mapError } = await supabase.from('storage_migration_map').upsert({ source_bucket: item.sourceBucket, source_path: item.sourcePath, target_bucket: bucketName, target_path: item.sourcePath, source_hash: item.sha256, metadata: item.metadata || {} }, { onConflict: 'source_bucket,source_path' })
      if (mapError) throw mapError
    }
    imported++
  } catch (error) {
    failed++
    console.error(`STORAGE ${item.sourcePath}: ${error.message}`)
  }
}
console.log(JSON.stringify({ bucketName, imported, failed, dryRun }, null, 2))
if (failed) process.exitCode = 2
