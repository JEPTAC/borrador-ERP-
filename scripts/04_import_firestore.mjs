import fs from 'node:fs'
import path from 'node:path'
import { optional, integer, bool, required } from './lib/env.mjs'
import { read } from './lib/jsonl.mjs'
import { adminClient } from './lib/supabase.mjs'

const exportDir = path.resolve(optional('EXPORT_DIR', './exports/firebase'))
const source = path.join(exportDir, 'firestore-documents.jsonl.gz')
if (!fs.existsSync(source)) throw new Error(`No existe ${source}`)
const batchSize = integer('BATCH_SIZE', 200)
const dryRun = bool('DRY_RUN', false)
const supabase = adminClient()
let batch = [], imported = 0
async function flush() {
  if (!batch.length) return
  if (!dryRun) {
    const { error } = await supabase.from('firestore_documents').upsert(batch, { onConflict: 'document_path', ignoreDuplicates: false })
    if (error) throw error
  }
  imported += batch.length
  console.log(`Firestore importado: ${imported}`)
  batch = []
}
for await (const doc of read(source)) {
  batch.push({ document_path: doc.documentPath, parent_path: doc.parentPath, collection_name: doc.collectionName, document_id: doc.documentId, payload: doc.payload, firebase_create_time: doc.firebaseCreateTime, firebase_update_time: doc.firebaseUpdateTime, source_hash: doc.sourceHash, source_project: required('FIREBASE_PROJECT_ID') })
  if (batch.length >= batchSize) await flush()
}
await flush()
console.log(JSON.stringify({ imported, dryRun }, null, 2))
