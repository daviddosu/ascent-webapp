const BACKEND_ORIGIN = 'https://daviddosu--shotcount-backend-fastapi-app.modal.run'

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
    return response.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const upstream = await fetch(`${BACKEND_ORIGIN}/api/v1/auth/email-code/verify`, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'x-forwarded-for': request.headers['x-forwarded-for'] || request.socket?.remoteAddress || '',
      },
      body: JSON.stringify({ email: request.body?.email || '', code: request.body?.code || '' }),
    })
    const body = await upstream.text()
    const cookies = readSetCookies(upstream.headers).map(shareCookieWithShotcount)
    if (cookies.length) response.setHeader('Set-Cookie', cookies)
    response.setHeader('Cache-Control', 'no-store')
    response.setHeader('Content-Type', 'application/json')
    return response.status(upstream.status).send(body)
  } catch {
    return response.status(502).json({ error: 'Email login is temporarily unavailable.' })
  }
}
