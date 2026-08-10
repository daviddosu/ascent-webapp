import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: corsHeaders })

  const authorization = request.headers.get('Authorization')
  if (!authorization) return new Response('Unauthorized', { status: 401, headers: corsHeaders })

  const url = Deno.env.get('SUPABASE_URL')
  const publicKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !publicKey || !serviceKey) {
    return new Response('Server configuration is incomplete', { status: 500, headers: corsHeaders })
  }

  const userClient = createClient(url, publicKey, { global: { headers: { Authorization: authorization } } })
  const { data: { user }, error: userError } = await userClient.auth.getUser()
  if (userError || !user) return new Response('Unauthorized', { status: 401, headers: corsHeaders })

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const storageKeys: string[] = []
  for (let offset = 0; ; offset += 1_000) {
    const assets = await admin.from('file_assets').select('storage_key')
      .eq('user_id', user.id)
      .order('storage_key')
      .range(offset, offset + 999)
    if (assets.error) return new Response('Could not remove account files', { status: 502, headers: corsHeaders })
    storageKeys.push(...(assets.data ?? []).map(asset => String(asset.storage_key)).filter(Boolean))
    if ((assets.data?.length ?? 0) < 1_000) break
  }
  for (let offset = 0; offset < storageKeys.length; offset += 100) {
    const removed = await admin.storage.from('private-file-assets').remove(storageKeys.slice(offset, offset + 100))
    if (removed.error) return new Response('Could not remove account files', { status: 502, headers: corsHeaders })
  }
  const avatar = await admin.storage.from('avatars').remove([`${user.id}/avatar`])
  if (avatar.error) return new Response('Could not remove account photo', { status: 502, headers: corsHeaders })

  const { error } = await admin.auth.admin.deleteUser(user.id)
  if (error) return new Response(error.message, { status: 500, headers: corsHeaders })

  return new Response(JSON.stringify({ deleted: true }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
