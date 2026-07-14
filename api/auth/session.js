const BACKEND_ORIGIN = 'https://daviddosu--shotcount-backend-fastapi-app.modal.run'

export default async function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET')
    return response.status(405).send('Method not allowed')
  }

  try {
    const upstream = await fetch(`${BACKEND_ORIGIN}/api/v1/auth/session`, {
      headers: {
        accept: 'application/json',
        cookie: request.headers.cookie || '',
      },
      redirect: 'manual',
    })
    const body = await upstream.text()
    response.setHeader('Cache-Control', 'no-store, private')
    response.setHeader('Content-Type', 'application/json')
    return response.status(upstream.status).send(body || 'null')
  } catch {
    return response.status(502).json({ error: 'auth_unavailable' })
  }
}
