self.addEventListener('install', event => {
  event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', event => {
  event.waitUntil(
    Promise.all([
      self.registration.unregister(),
      caches.keys().then(keys => Promise.all(
        keys
          .filter(key => key.startsWith('ascent-'))
          .map(key => caches.delete(key)),
      )),
      self.clients.claim(),
    ]).then(() => self.clients.matchAll({ type: 'window', includeUncontrolled: true }))
      .then(clients => Promise.all(clients.map(client => {
        if ('navigate' in client) return client.navigate(client.url)
        return undefined
      }))),
  )
})
