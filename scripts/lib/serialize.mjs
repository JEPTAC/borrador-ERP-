import crypto from 'node:crypto'

export function serialize(value) {
  if (value == null) return value
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value
  if (value instanceof Date) return { __type: 'timestamp', value: value.toISOString() }
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) return { __type: 'bytes', base64: Buffer.from(value).toString('base64') }
  if (Array.isArray(value)) return value.map(serialize)
  if (typeof value.toDate === 'function') return { __type: 'timestamp', value: value.toDate().toISOString() }
  if (typeof value.path === 'string' && value.firestore) return { __type: 'reference', path: value.path }
  if (Number.isFinite(value.latitude) && Number.isFinite(value.longitude)) return { __type: 'geopoint', latitude: value.latitude, longitude: value.longitude }
  if (typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, serialize(v)]))
  return String(value)
}
export function sha256(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')
}
