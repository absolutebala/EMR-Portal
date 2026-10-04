// Service worker served from a route (not public/sw.js) so its bytes change every build
// via the embedded build id. A changing sw.js is what makes the browser install a new
// version each deploy → purge the old cache (named with the old build id) → and, via
// clients.claim() + the controllerchange listener in SwRegister, reload open PWA sessions
// onto the current build. Without this, a long-open PWA keeps running the previous
// build's JS and calls Server Action IDs the new server no longer has ("Failed to find
// Server Action"), and login/other actions silently hang.

export const dynamic = 'force-static'

const BUILD = process.env.NEXT_PUBLIC_BUILD_ID || 'dev'

const SW = `
const CACHE = 'emr-mobile-${BUILD}'

self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', event => {
  const { request } = event
  const url = new URL(request.url)

  if (request.method !== 'GET') return
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/')) return
  // Never serve the service worker itself from cache — always from the network so a new
  // deploy is picked up immediately.
  if (url.pathname === '/sw.js') return

  // Static Next.js chunks (content-hashed, immutable for a given build): cache-first.
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.match(request).then(cached =>
        cached || fetch(request).then(res => {
          const clone = res.clone()
          caches.open(CACHE).then(c => c.put(request, clone))
          return res
        })
      )
    )
    return
  }

  // Navigation requests: network-first, fallback to cache (offline).
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(res => {
          const clone = res.clone()
          caches.open(CACHE).then(c => c.put(request, clone))
          return res
        })
        .catch(async () => {
          const cached = await caches.match(request)
          return cached || caches.match('/mobile')
        })
    )
    return
  }

  // Everything else: network with cache fallback.
  event.respondWith(
    fetch(request)
      .then(res => {
        const clone = res.clone()
        caches.open(CACHE).then(c => c.put(request, clone))
        return res
      })
      .catch(() => caches.match(request))
  )
})

// Background sync: retry pending form submissions / check-ins when back online.
self.addEventListener('sync', event => {
  if (event.tag === 'sync-form-submissions') {
    event.waitUntil(self.clients.matchAll().then(clients => clients.forEach(c => c.postMessage({ type: 'SYNC_SUBMISSIONS' }))))
  }
  if (event.tag === 'sync-checkin-submissions') {
    event.waitUntil(self.clients.matchAll().then(clients => clients.forEach(c => c.postMessage({ type: 'SYNC_CHECKINS' }))))
  }
  if (event.tag === 'sync-closure-submissions') {
    event.waitUntil(self.clients.matchAll().then(clients => clients.forEach(c => c.postMessage({ type: 'SYNC_CLOSURES' }))))
  }
})

// Push notifications: server sends { title, body, url } (see lib/push.ts).
self.addEventListener('push', event => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch (e) { /* ignore malformed payload */ }
  const title = data.title || 'EMR Field App'
  const options = {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: { url: data.url || '/mobile/alerts' },
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/mobile/alerts'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url.includes(url) && 'focus' in client) return client.focus()
      }
      if (self.clients.openWindow) return self.clients.openWindow(url)
    })
  )
})
`

export function GET() {
  return new Response(SW, {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Service-Worker-Allowed': '/',
    },
  })
}
