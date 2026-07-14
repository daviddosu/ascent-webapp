const BACKEND_ORIGIN = 'https://daviddosu--shotcount-backend-fastapi-app.modal.run'
const WORKSPACE_URL = 'https://app.shotcount.app/'

function readCredential(body) {
  if (body && typeof body === 'object' && typeof body.credential === 'string') {
    return body.credential
  }
  if (typeof body === 'string') {
    return new URLSearchParams(body).get('credential') || ''
  }
  return ''
}

function readSetCookies(headers) {
  if (typeof headers.getSetCookie === 'function') return headers.getSetCookie()
  const cookie = headers.get('set-cookie')
  return cookie ? cookie.split(/,(?=[^;]+?=)/g) : []
}

function shareCookieWithShotcount(cookie) {
  const withoutDomain = cookie.replace(/;\s*Domain=[^;]+/i, '')
  return `${withoutDomain}; Domain=.shotcount.app`
}

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    return response.status(405).send('Method not allowed')
  }

  const credential = readCredential(request.body)
  if (!credential) {
    return response.redirect(303, '/?auth=signin&error=google-signin-unavailable')
  }

  try {
    const upstream = await fetch(`${BACKEND_ORIGIN}/api/v1/auth/google`, {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({ credential }),
      redirect: 'manual',
    })

    if (!upstream.ok) {
      return response.redirect(303, '/?auth=signin&error=google-signin-unavailable')
    }

    const cookies = readSetCookies(upstream.headers).map(shareCookieWithShotcount)
    if (cookies.length) response.setHeader('Set-Cookie', cookies)
    response.setHeader('Cache-Control', 'no-store')
    return response.redirect(303, WORKSPACE_URL)
  } catch {
    return response.redirect(303, '/?auth=signin&error=google-signin-unavailable')
  }
}
