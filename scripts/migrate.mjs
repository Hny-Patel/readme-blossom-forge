/**
 * Run Supabase migrations via the Management API.
 *
 * Setup (one time):
 *   1. Go to https://supabase.com/dashboard/account/tokens
 *   2. Create a new access token
 *   3. Add it to .env:  SUPABASE_ACCESS_TOKEN=sbp_xxxxxxxx
 *
 * Usage:
 *   node scripts/migrate.mjs
 */

import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Load .env manually (no dotenv dependency needed)
function loadEnv() {
  const envPath = resolve(__dirname, '../.env')
  const env = {}
  try {
    const lines = readFileSync(envPath, 'utf8').split('\n')
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eqIdx = trimmed.indexOf('=')
      if (eqIdx === -1) continue
      const key = trimmed.slice(0, eqIdx).trim()
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '')
      env[key] = val
    }
  } catch {
    console.error('Could not read .env file')
    process.exit(1)
  }
  return env
}

const env = loadEnv()

const PROJECT_REF = env.VITE_SUPABASE_PROJECT_ID
const ACCESS_TOKEN = env.SUPABASE_ACCESS_TOKEN

if (!PROJECT_REF) {
  console.error('Missing VITE_SUPABASE_PROJECT_ID in .env')
  process.exit(1)
}
if (!ACCESS_TOKEN) {
  console.error(
    'Missing SUPABASE_ACCESS_TOKEN in .env\n' +
    'Get one at: https://supabase.com/dashboard/account/tokens'
  )
  process.exit(1)
}

// Read the migration SQL
const sqlPath = resolve(__dirname, '../supabase/migrations/20260413120000_user_keys.sql')
const sql = readFileSync(sqlPath, 'utf8')

console.log('Running migration: user_keys table...')

const response = await fetch(
  `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
  {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  }
)

const result = await response.json()

if (!response.ok) {
  console.error('Migration failed:', JSON.stringify(result, null, 2))
  process.exit(1)
}

console.log('Migration applied successfully.')
console.log(JSON.stringify(result, null, 2))
