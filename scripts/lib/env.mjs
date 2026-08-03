import 'dotenv/config'

export function required(name) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Falta la variable obligatoria ${name}`)
  return value
}
export function optional(name, fallback = '') {
  const value = process.env[name]
  return value == null || value === '' ? fallback : value.trim()
}
export function bool(name, fallback = false) {
  const value = optional(name, String(fallback)).toLowerCase()
  return ['1', 'true', 'yes', 'si', 'sí'].includes(value)
}
export function integer(name, fallback) {
  const value = Number.parseInt(optional(name, String(fallback)), 10)
  if (!Number.isFinite(value) || value < 1) throw new Error(`${name} debe ser un entero positivo`)
  return value
}
export function baseUrl() {
  return required('SUPABASE_URL').replace(/\/rest\/v1\/?$/i, '').replace(/\/$/, '')
}
