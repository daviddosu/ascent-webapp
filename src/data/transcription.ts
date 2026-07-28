import { currentUser, getCloudClient } from './cloud'

export function appendTranscript(description: string, transcript: string) {
  const spoken = transcript.trim()
  if (!spoken) return description
  return description.trim() ? `${description.trimEnd()}\n\n${spoken}` : spoken
}

export async function prepareDescriptionTranscription() {
  const [client, user] = await Promise.all([getCloudClient(), currentUser()])
  if (!client || !user) return
  await client.functions.invoke('transcribe-description', {
    method: 'POST',
    headers: { 'x-shotcount-warmup': '1' },
  }).catch(() => undefined)
}

export async function transcribeDescriptionAudio(audio: Blob): Promise<string> {
  const [client, user] = await Promise.all([getCloudClient(), currentUser()])
  if (!client || !user) throw new Error('Sign in to use voice input.')
  const form = new FormData()
  const extension = audio.type.includes('mp4') || audio.type.includes('m4a') ? 'm4a' : audio.type.includes('ogg') ? 'ogg' : audio.type.includes('wav') ? 'wav' : 'webm'
  form.append('audio', audio, `description.${extension}`)
  const { data, error } = await client.functions.invoke<{ text?: string }>('transcribe-description', { method: 'POST', body: form })
  if (error || !data?.text) {
    const response = error?.context instanceof Response ? error.context : null
    const detail = response ? await response.clone().text().catch(() => '') : ''
    throw new Error(detail || error?.message || 'Transcription was unavailable.')
  }
  return data.text
}
