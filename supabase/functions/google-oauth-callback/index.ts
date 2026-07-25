import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  decryptSecret,
  encryptSecret,
  sha256Hex,
} from '../_shared/crypto.ts'
import { missingGoogleExecutionScopes } from '../_shared/google-scopes.ts'

type OAuthStateRow = {
  state_hash: string
  user_id: string
  code_verifier_ciphertext: string
  return_to: string
  expires_at: string
  used_at: string | null
}

function fallbackAppOrigin() {
  const origins = (Deno.env.get('SHOTCOUNT_APP_ORIGINS') ?? '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean)
  return origins.find(origin => origin === 'https://app.shotcount.app') ??
    origins[0] ??
    'https://app.shotcount.app'
}

function redirectWith(returnTo: string, status: 'connected' | 'error', reason = '') {
  const url = new URL(returnTo)
  url.searchParams.set('google', status)
  if (reason) url.searchParams.set('reason', reason.slice(0, 80))
  return Response.redirect(url.toString(), 303)
}

Deno.serve(async request => {
  if (request.method !== 'GET') return new Response('Method not allowed', { status: 405 })
  const requestUrl = new URL(request.url)
  const state = requestUrl.searchParams.get('state') ?? ''
  const code = requestUrl.searchParams.get('code') ?? ''
  const oauthError = requestUrl.searchParams.get('error') ?? ''
  const url = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const clientId = Deno.env.get('GOOGLE_OAUTH_CLIENT_ID')
  const clientSecret = Deno.env.get('GOOGLE_OAUTH_CLIENT_SECRET')
  const redirectUri = Deno.env.get('GOOGLE_OAUTH_REDIRECT_URI')
  const fallback = fallbackAppOrigin()
  if (!url || !serviceKey || !clientId || !clientSecret || !redirectUri || !state) {
    return redirectWith(fallback, 'error', 'configuration')
  }

  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
  const stateHash = await sha256Hex(state)
  const claimedAt = new Date().toISOString()
  const stateResult = await admin
    .from('agent_oauth_states')
    .update({ used_at: claimedAt })
    .eq('state_hash', stateHash)
    .is('used_at', null)
    .gt('expires_at', claimedAt)
    .select('state_hash,user_id,code_verifier_ciphertext,return_to,expires_at,used_at')
    .maybeSingle()
  const oauthState = stateResult.data as OAuthStateRow | null
  if (stateResult.error || !oauthState) {
    return redirectWith(fallback, 'error', 'invalid_state')
  }
  if (oauthError || !code) {
    return redirectWith(oauthState.return_to, 'error', oauthError || 'missing_code')
  }

  try {
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
        code_verifier: await decryptSecret(oauthState.code_verifier_ciphertext),
      }),
    })
    const token = await tokenResponse.json() as {
      access_token?: string
      refresh_token?: string
      expires_in?: number
      scope?: string
      token_type?: string
      error?: string
    }
    if (!tokenResponse.ok || !token.access_token) throw new Error(token.error || 'token_exchange_failed')

    const grantedScopes = (token.scope ?? '').split(' ').filter(Boolean)
    if (missingGoogleExecutionScopes(grantedScopes).length) {
      throw new Error('required_scopes_missing')
    }

    const userInfoResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${token.access_token}` },
    })
    const userInfo = await userInfoResponse.json() as { sub?: string; email?: string }
    if (!userInfoResponse.ok || !userInfo.sub) throw new Error('userinfo_failed')

    const existing = await admin
      .from('agent_integrations')
      .select('refresh_token_ciphertext')
      .eq('user_id', oauthState.user_id)
      .eq('provider', 'google')
      .maybeSingle()
    const encryptedRefreshToken = token.refresh_token
      ? await encryptSecret(token.refresh_token)
      : existing.data?.refresh_token_ciphertext
    if (!encryptedRefreshToken) throw new Error('refresh_token_missing')

    const { error: saveError } = await admin.from('agent_integrations').upsert({
      user_id: oauthState.user_id,
      provider: 'google',
      status: 'connected',
      provider_user_id: userInfo.sub,
      account_email: userInfo.email ?? '',
      scopes: grantedScopes,
      access_token_ciphertext: await encryptSecret(token.access_token),
      refresh_token_ciphertext: encryptedRefreshToken,
      token_expires_at: new Date(Date.now() + Math.max(60, token.expires_in ?? 3600) * 1000).toISOString(),
      last_refresh_at: new Date().toISOString(),
      last_error: '',
    }, { onConflict: 'user_id,provider' })
    if (saveError) throw new Error('integration_save_failed')
    return redirectWith(oauthState.return_to, 'connected')
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'oauth_failed'
    return redirectWith(oauthState.return_to, 'error', reason)
  }
})
