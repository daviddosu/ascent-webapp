function base64UrlEncode(bytes: Uint8Array) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function base64UrlDecode(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
  const binary = atob(padded)
  return Uint8Array.from(binary, character => character.charCodeAt(0))
}

function encryptionKeyBytes() {
  const encoded = Deno.env.get('GOOGLE_TOKEN_ENCRYPTION_KEY')?.trim()
  if (!encoded) throw new Error('Google token encryption is not configured.')
  const bytes = base64UrlDecode(encoded)
  if (bytes.byteLength !== 32) throw new Error('Google token encryption key must be 32 bytes.')
  return bytes
}

async function encryptionKey() {
  return crypto.subtle.importKey('raw', encryptionKeyBytes(), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
}

export async function encryptSecret(value: string) {
  if (!value) throw new Error('Cannot encrypt an empty secret.')
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    await encryptionKey(),
    new TextEncoder().encode(value),
  )
  return `v1.${base64UrlEncode(iv)}.${base64UrlEncode(new Uint8Array(encrypted))}`
}

export async function decryptSecret(value: string) {
  const [version, ivValue, ciphertext] = value.split('.')
  if (version !== 'v1' || !ivValue || !ciphertext) throw new Error('Encrypted secret has an invalid format.')
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64UrlDecode(ivValue) },
    await encryptionKey(),
    base64UrlDecode(ciphertext),
  )
  return new TextDecoder().decode(decrypted)
}

export function randomBase64Url(byteLength = 32) {
  return base64UrlEncode(crypto.getRandomValues(new Uint8Array(byteLength)))
}

export async function sha256Base64Url(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return base64UrlEncode(new Uint8Array(digest))
}

export async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
}
