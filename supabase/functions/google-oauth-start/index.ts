import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  encryptSecret,
  randomBase64Url,
  sha256Base64Url,
  sha256Hex,
} from '../_shared/crypto.ts'

const googleScopes = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.events.freebusy',
  'https://www.googleapis.com/auth/contacts.readonly',
]

function configuredOrigins() {
  return (Deno.env.get('SHOTCOUNT_APP_ORIGINS') ?? '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean)
}

function allowedOrigin(request: Request) {
  const requestOrigin = request.headers.get('Origin') ?? ''
  const configured = configuredOrigins()
  if (configured.length) return configured.includes(requestOrigin) ? requestOrigin : ''
  return /^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(requestOrigin) ? requestOrigin : ''
}

function headers(request: Request) {
  const origin = allowedOrigin(request)
  return {
    ...(origin ? { 'Access-Control-Allow-Origin': origin } : {}),
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
    'Vary': 'Origin',
  }
}

function response(request: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: headers(request) })
}

function safeReturnTo(request: Request, value: unknown) {
  const origins = configuredOrigins()
  const fallback = origins[0] ?? allowedOrigin(request)
  if (typeof value !== 'string') return fallback
  try {
    const url = new URL(value)
    return origins.includes(url.origin) ? `${url.origin}${url.pathname}` : fallback
  } catch {
    return fallback
  }
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: headers(request) })
  if (request.method !== 'POST') return response(request, { error: 'Method not allowed' }, 405)
  if (!allowedOrigin(request)) return response(request, { error: 'Origin not allowed' }, 403)

  const authorization = request.headers.get('Authorization')
  const url = Deno.env.get('SUPABASE_URL')
  const publicKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const clientId = Deno.env.get('GOOGLE_OAUTH_CLIENT_ID')
  const redirectUri = Deno.env.get('GOOGLE_OAUTH_REDIRECT_URI')
  if (!authorization) return response(request, { error: 'Unauthorized' }, 401)
  if (!url || !publicKey || !serviceKey || !clientId || !redirectUri) {
    return response(request, { error: 'Google connection is not configured' }, 503)
  }

  const userClient = createClient(url, publicKey, { global: { headers: { Authorization: authorization } } })
  const { data: { user }, error: userError } = await userClient.auth.getUser()
  if (userError || !user) return response(request, { error: 'Unauthorized' }, 401)

  const body = await request.json().catch(() => ({})) as { returnTo?: string }
  const state = randomBase64Url(32)
  const codeVerifier = randomBase64Url(64)
  const codeChallenge = await sha256Base64Url(codeVerifier)
  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
  await admin.from('agent_oauth_states').delete().eq('user_id', user.id).lt('expires_at', new Date().toISOString())
  const { error } = await admin.from('agent_oauth_states').insert({
    state_hash: await sha256Hex(state),
    user_id: user.id,
    provider: 'google',
    code_verifier_ciphertext: await encryptSecret(codeVerifier),
    return_to: safeReturnTo(request, body.returnTo),
    expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  })
  if (error) return response(request, { error: 'Could not start Google connection' }, 500)

  const authorizationUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  authorizationUrl.searchParams.set('client_id', clientId)
  authorizationUrl.searchParams.set('redirect_uri', redirectUri)
  authorizationUrl.searchParams.set('response_type', 'code')
  authorizationUrl.searchParams.set('scope', googleScopes.join(' '))
  authorizationUrl.searchParams.set('access_type', 'offline')
  authorizationUrl.searchParams.set('include_granted_scopes', 'true')
  authorizationUrl.searchParams.set('prompt', 'consent')
  authorizationUrl.searchParams.set('state', state)
  authorizationUrl.searchParams.set('code_challenge', codeChallenge)
  authorizationUrl.searchParams.set('code_challenge_method', 'S256')

  return response(request, { authorizationUrl: authorizationUrl.toString() })
})
