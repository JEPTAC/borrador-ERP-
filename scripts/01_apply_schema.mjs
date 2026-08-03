import fs from 'node:fs'
import { Client } from 'pg'
import { optional } from './lib/env.mjs'

const dbUrl = optional('SUPABASE_DB_URL')
if (!dbUrl) {
  console.log('SUPABASE_DB_URL no está configurada. Ejecute sql/000_EJECUTAR_EN_SUPABASE.sql en Supabase SQL Editor y continúe.')
  process.exit(0)
}
const sql = fs.readFileSync(new URL('../sql/000_EJECUTAR_EN_SUPABASE.sql', import.meta.url), 'utf8')
const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } })
await client.connect()
try {
  await client.query(sql)
  console.log('Esquema Supabase aplicado correctamente.')
} finally {
  await client.end()
}
