import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const MAX_AUDIO_BYTES = 5 * 1024 * 1024
const supportedTypes = new Set(['audio/webm', 'video/webm', 'audio/mp4', 'audio/x-m4a', 'audio/mpeg', 'audio/mp3', 'audio/ogg', 'audio/wav', 'audio/x-wav', 'audio/aac'])
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-shotcount-warmup',
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: corsHeaders })

  const authorization = request.headers.get('Authorization')
  const url = Deno.env.get('SUPABASE_URL')
  const publicKey = Deno.env.get('SUPABASE_ANON_KEY')
  const openaiKey = Deno.env.get('OPENAI_API_KEY')
  if (!authorization) return new Response('Unauthorized', { status: 401, headers: corsHeaders })
  if (!url || !publicKey || !openaiKey) return new Response('Server configuration is incomplete', { status: 500, headers: corsHeaders })

  const userClient = createClient(url, publicKey, { global: { headers: { Authorization: authorization } } })
  const { data: { user }, error } = await userClient.auth.getUser()
  if (error || !user) return new Response('Unauthorized', { status: 401, headers: corsHeaders })
  if (request.headers.get('x-shotcount-warmup') === '1') {
    return new Response(JSON.stringify({ ready: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const form = await request.formData().catch(() => null)
  const audio = form?.get('audio')
  if (!(audio instanceof File) || !audio.size) return new Response('No audio was captured', { status: 400, headers: corsHeaders })
  if (audio.size > MAX_AUDIO_BYTES) return new Response('Recording is too large', { status: 413, headers: corsHeaders })
  if (!supportedTypes.has(audio.type.split(';', 1)[0])) return new Response('This audio format is not supported', { status: 415, headers: corsHeaders })

  const startedAt = Date.now()
  const openAiForm = new FormData()
  openAiForm.append('file', audio, audio.name || 'description.webm')
  openAiForm.append('model', 'gpt-4o-mini-transcribe')
  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST', headers: { Authorization: `Bearer ${openaiKey}` }, body: openAiForm,
  })
  if (!response.ok) {
    console.error(JSON.stringify({ event: 'description_transcription_failed', userId: user.id, model: 'gpt-4o-mini-transcribe', latencyMs: Date.now() - startedAt, status: response.status }))
    return new Response('Transcription service is unavailable', { status: 502, headers: corsHeaders })
  }
  const result = await response.json() as { text?: string; usage?: unknown }
  const text = result.text?.trim()
  if (!text) return new Response('No speech was detected', { status: 422, headers: corsHeaders })
  console.info(JSON.stringify({ event: 'description_transcription_succeeded', userId: user.id, model: 'gpt-4o-mini-transcribe', latencyMs: Date.now() - startedAt, audioBytes: audio.size, usage: result.usage }))
  return new Response(JSON.stringify({ text }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
