import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { FieldPath, getFirestore } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'
import { getStorage } from 'firebase-admin/storage'
import { required, optional, bool, integer } from './lib/env.mjs'
import { writer } from './lib/jsonl.mjs'
import { serialize, sha256 } from './lib/serialize.mjs'

const servicePath = required('FIREBASE_SERVICE_ACCOUNT_PATH')
const exportDir = path.resolve(optional('EXPORT_DIR', './exports/firebase'))
const batchSize = integer('BATCH_SIZE', 200)
const downloadStorage = bool('DOWNLOAD_STORAGE', true)
const account = JSON.parse(fs.readFileSync(servicePath, 'utf8'))
const bucketName = optional('FIREBASE_STORAGE_BUCKET', `${account.project_id}.firebasestorage.app`)
if (!getApps().length) initializeApp({ credential: cert(account), storageBucket: bucketName })
const db = getFirestore()
const auth = getAuth()
const bucket = getStorage().bucket(bucketName)
fs.mkdirSync(path.join(exportDir, 'storage'), { recursive: true })
const docs = writer(path.join(exportDir, 'firestore-documents.jsonl.gz'))
const users = writer(path.join(exportDir, 'auth-users.jsonl.gz'))
const files = writer(path.join(exportDir, 'storage-manifest.jsonl.gz'))
const manifest = { format: 2, sourceProject: account.project_id, sourceBucket: bucketName, startedAt: new Date().toISOString(), firestoreDocuments: 0, authUsers: 0, storageObjects: 0, collections: {}, errors: [] }

async function exportCollection(ref) {
  let cursor = null
  for (;;) {
    let query = ref.orderBy(FieldPath.documentId()).limit(batchSize)
    if (cursor) query = query.startAfter(cursor)
    const snap = await query.get()
    if (snap.empty) break
    for (const doc of snap.docs) {
      const payload = serialize(doc.data())
      docs.write({ documentPath: doc.ref.path, parentPath: doc.ref.parent.parent?.path || null, collectionName: doc.ref.parent.id, documentId: doc.id, payload, firebaseCreateTime: doc.createTime?.toDate?.().toISOString() || null, firebaseUpdateTime: doc.updateTime?.toDate?.().toISOString() || null, sourceHash: sha256(payload) })
      manifest.firestoreDocuments++
      manifest.collections[doc.ref.parent.id] = (manifest.collections[doc.ref.parent.id] || 0) + 1
      for (const sub of await doc.ref.listCollections()) await exportCollection(sub)
    }
    cursor = snap.docs.at(-1)
    if (snap.size < batchSize) break
  }
}

try {
  for (const collection of await db.listCollections()) {
    console.log(`Firestore: ${collection.id}`)
    await exportCollection(collection)
  }
  let pageToken
  do {
    const page = await auth.listUsers(Math.min(batchSize, 1000), pageToken)
    for (const user of page.users) {
      const record = user.toJSON()
      record.customClaims = user.customClaims || {}
      record.passwordHash = user.passwordHash ? Buffer.from(user.passwordHash).toString('base64') : null
      record.passwordSalt = user.passwordSalt ? Buffer.from(user.passwordSalt).toString('base64') : null
      users.write(record)
      manifest.authUsers++
    }
    pageToken = page.pageToken
  } while (pageToken)
  if (downloadStorage) {
    let pageToken
    do {
      const [batch, , response] = await bucket.getFiles({ autoPaginate: false, maxResults: Math.min(batchSize, 1000), pageToken })
      for (const file of batch) {
        const [metadata] = await file.getMetadata()
        const local = path.join(exportDir, 'storage', ...file.name.split('/').map(encodeURIComponent))
        fs.mkdirSync(path.dirname(local), { recursive: true })
        await file.download({ destination: local })
        const checksum = crypto.createHash('sha256').update(fs.readFileSync(local)).digest('hex')
        files.write({ sourceBucket: bucketName, sourcePath: file.name, localPath: path.relative(exportDir, local), metadata, sha256: checksum })
        manifest.storageObjects++
      }
      pageToken = response?.nextPageToken
    } while (pageToken)
  }
} catch (error) {
  manifest.errors.push({ message: error.message, stack: error.stack })
  throw error
} finally {
  await Promise.all([docs.close(), users.close(), files.close()])
  manifest.completedAt = new Date().toISOString()
  fs.writeFileSync(path.join(exportDir, 'manifest.json'), JSON.stringify(manifest, null, 2))
}
console.log(JSON.stringify(manifest, null, 2))
