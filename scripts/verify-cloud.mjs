import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function readEnvFile(path) {
  if (!existsSync(path)) return {}
  return Object.fromEntries(
    readFileSync(path, 'utf8')
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#') && line.includes('='))
      .map(line => {
        const index = line.indexOf('=')
        return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^['"]|['"]$/g, '')]
      }),
  )
}

const root = resolve(import.meta.dirname, '..')
const fileEnv = {
  ...readEnvFile(resolve(root, '.env')),
  ...readEnvFile(resolve(root, '.env.local')),
}
const url = process.env.VITE_SUPABASE_URL || fileEnv.VITE_SUPABASE_URL
const key = process.env.VITE_SUPABASE_ANON_KEY || fileEnv.VITE_SUPABASE_ANON_KEY

if (!url || !key) {
  console.error('Cloud check needs VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local.')
  process.exit(1)
}

const base = url.replace(/\/$/, '')
const headers = { apikey: key, Authorization: `Bearer ${key}` }

async function check(label, request, expected = response => response.ok) {
  try {
    const response = await fetch(request.url, request.options)
    if (!expected(response)) throw new Error(`HTTP ${response.status}`)
    console.log(`✓ ${label}`)
  } catch (error) {
    console.error(`✗ ${label}: ${error instanceof Error ? error.message : 'unknown error'}`)
    process.exitCode = 1
  }
}

await check('Supabase Auth health', {
  url: `${base}/auth/v1/health`,
  options: { headers: { apikey: key } },
})
await check('Database migration and tasks endpoint', {
  url: `${base}/rest/v1/tasks?select=id&limit=1`,
  options: { headers },
})
await check('Account deletion function deployed', {
  url: `${base}/functions/v1/delete-account`,
  options: { method: 'OPTIONS', headers },
})
await check('AI coach function deployed', {
  url: `${base}/functions/v1/ai-coach`,
  options: { method: 'OPTIONS', headers },
})

if (!process.exitCode) console.log('Cloud surface is reachable. Signed-in journeys still require a test account.')
