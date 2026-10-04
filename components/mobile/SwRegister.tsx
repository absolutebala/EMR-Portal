'use client'

import { useEffect } from 'react'

export default function SwRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    // updateViaCache:'none' — never let the HTTP cache answer the sw.js update check, so
    // a new deploy's service worker (bytes differ via the embedded build id) is always
    // detected.
    navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).catch(() => {})

    // When a new service worker takes control (a new build went live), reload once so the
    // page runs the current build's code — otherwise a long-open PWA keeps calling the
    // previous build's Server Actions ("Failed to find Server Action"), and login/other
    // actions hang. Guarded so a first-time install (no existing controller) never reloads.
    let refreshing = false
    const onControllerChange = () => {
      if (refreshing) return
      refreshing = true
      window.location.reload()
    }
    if (navigator.serviceWorker.controller) {
      navigator.serviceWorker.addEventListener('controllerchange', onControllerChange)
    }
    return () => navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange)
  }, [])
  return null
}
