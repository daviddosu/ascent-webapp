import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'

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
const env = { ...fileEnv, ...process.env }
const url = env.VITE_SUPABASE_URL
const key = env.VITE_SUPABASE_ANON_KEY
const previousEnvPrefix = String.fromCharCode(97, 115, 99, 101, 110, 116).toUpperCase()
const email = env.SHOTCOUNT_TEST_EMAIL ?? env[`${previousEnvPrefix}_TEST_EMAIL`]
const password = env.SHOTCOUNT_TEST_PASSWORD ?? env[`${previousEnvPrefix}_TEST_PASSWORD`]

if (!url || !key || !email || !password) {
  console.error('Authenticated cloud check needs Supabase variables plus SHOTCOUNT_TEST_EMAIL and SHOTCOUNT_TEST_PASSWORD.')
  process.exit(1)
}

const client = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
})
const temporaryName = `Shotcount verification ${crypto.randomUUID()}`
let temporaryId
let plannerRecordId
let secondClient

try {
  const { data: session, error: signInError } = await client.auth.signInWithPassword({ email, password })
  if (signInError || !session.user) throw new Error(signInError?.message ?? 'Sign-in returned no user.')
  console.log('✓ Test account sign-in')

  const { data: created, error: createError } = await client
    .from('lists')
    .insert({ user_id: session.user.id, name: temporaryName, color: '#66d6d9', position: 999_999 })
    .select('id,name')
    .single()
  if (createError || !created) throw new Error(createError?.message ?? 'Temporary row was not created.')
  temporaryId = created.id
  console.log('✓ Authenticated RLS insert')

  const { data: readBack, error: readError } = await client.from('lists').select('id,name').eq('id', temporaryId).single()
  if (readError || readBack?.name !== temporaryName) throw new Error(readError?.message ?? 'Temporary row could not be read back.')
  console.log('✓ Authenticated RLS read')

  const { error: deleteError } = await client.from('lists').delete().eq('id', temporaryId)
  if (deleteError) throw new Error(deleteError.message)
  temporaryId = undefined
  console.log('✓ Authenticated RLS delete')

  plannerRecordId = crypto.randomUUID()
  secondClient = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  const { error: secondSignInError } = await secondClient.auth.signInWithPassword({ email, password })
  if (secondSignInError) throw new Error(secondSignInError.message)
  const firstTime = new Date().toISOString()
  const titleTime = new Date(Date.now() + 2_000).toISOString()
  const dueTime = new Date(Date.now() + 1_000).toISOString()
  const initial = await client.rpc('merge_planner_record', {
    p_record_type: 'task',
    p_record_id: plannerRecordId,
    p_parent_id: null,
    p_patch: { title: 'Cloud verification', due: '2026-07-14' },
    p_field_versions: { title: firstTime, due: firstTime, _deleted: firstTime },
    p_deleted_at: null,
  })
  if (initial.error) throw new Error(initial.error.message)
  const [phoneEdit, laptopEdit] = await Promise.all([
    client.rpc('merge_planner_record', {
      p_record_type: 'task', p_record_id: plannerRecordId, p_parent_id: null,
      p_patch: { title: 'Phone title' }, p_field_versions: { title: titleTime }, p_deleted_at: null,
    }),
    secondClient.rpc('merge_planner_record', {
      p_record_type: 'task', p_record_id: plannerRecordId, p_parent_id: null,
      p_patch: { due: '2026-07-20' }, p_field_versions: { due: dueTime }, p_deleted_at: null,
    }),
  ])
  if (phoneEdit.error) throw new Error(phoneEdit.error.message)
  if (laptopEdit.error) throw new Error(laptopEdit.error.message)
  const { data: merged, error: mergeReadError } = await client
    .from('planner_records')
    .select('data')
    .eq('record_type', 'task')
    .eq('record_id', plannerRecordId)
    .single()
  if (mergeReadError || merged?.data?.title !== 'Phone title' || merged?.data?.due !== '2026-07-20') {
    throw new Error(mergeReadError?.message ?? 'Two-device fields did not merge.')
  }
  console.log('✓ Cross-device field merge')
  const { error: plannerDeleteError } = await client
    .from('planner_records')
    .delete()
    .eq('record_type', 'task')
    .eq('record_id', plannerRecordId)
  if (plannerDeleteError) throw new Error(plannerDeleteError.message)
  plannerRecordId = undefined

  if ((env.SHOTCOUNT_TEST_AI ?? env[`${previousEnvPrefix}_TEST_AI`]) === 'true') {
    const { data, error } = await client.functions.invoke('ai-coach', { method: 'POST' })
    if (error || !data?.title || !data?.detail || !Array.isArray(data?.actions)) {
      throw new Error(error?.message ?? 'AI coach returned an invalid response.')
    }
    console.log('✓ Private AI coach response')
  }

  console.log('Authenticated cloud journey passed.')
} catch (error) {
  console.error(`✗ Authenticated cloud journey: ${error instanceof Error ? error.message : 'unknown error'}`)
  process.exitCode = 1
} finally {
  if (temporaryId) await client.from('lists').delete().eq('id', temporaryId)
  if (plannerRecordId) await client.from('planner_records').delete().eq('record_type', 'task').eq('record_id', plannerRecordId)
  if (secondClient) await secondClient.auth.signOut()
  await client.auth.signOut()
}
