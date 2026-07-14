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
    return response.status(405).send('Method not allowed')
  }

  try {
    const upstream = await fetch(`${BACKEND_ORIGIN}/api/v1/auth/logout`, {
      method: 'POST',
      headers: { cookie: request.headers.cookie || '' },
      redirect: 'manual',
    })
    const cookies = readSetCookies(upstream.headers).map(shareCookieWithShotcount)
    if (cookies.length) response.setHeader('Set-Cookie', cookies)
    response.setHeader('Cache-Control', 'no-store')
    return response.status(204).end()
  } catch {
    return response.status(502).json({ error: 'auth_unavailable' })
  }
}
