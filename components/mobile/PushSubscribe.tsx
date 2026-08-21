'use client'

import { useEffect, useState } from 'react'
import { savePushSubscription } from '@/app/actions/push-subscriptions'

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i)
  return outputArray
}

const DISMISS_KEY = 'emr-push-prompt-dismissed'

// Opt-in banner, not a hard gate like LocationGate — push is a nice-to-have, so an
// engineer who dismisses it (or denies the OS prompt) just doesn't get OS-level
// alerts and keeps using the in-app Alerts page as before.
// Creates the actual Push subscription and saves it server-side — factored out so it
// can run both from the button (enable()) and silently in the background (when
// permission is already granted but the subscription itself has lapsed, e.g. after a
// service worker re-registration).
async function subscribe(): Promise<void> {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  if (!publicKey) return
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
  })
  const json = sub.toJSON()
  if (json.endpoint && json.keys?.p256dh && json.keys?.auth) {
    await savePushSubscription({ endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } })
  }
}

export default function PushSubscribe() {
  const [visible, setVisible] = useState(false)
  const [subscribing, setSubscribing] = useState(false)

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return
    if (Notification.permission === 'denied') return
    if (localStorage.getItem(DISMISS_KEY)) return

    if (Notification.permission === 'granted') {
      // The user already decided — Notification.permission is the browser's own
      // persistent record of that, so this banner must never show again regardless
      // of whether the underlying push subscription itself is still alive. If it
      // lapsed, quietly re-create it — no UI, no re-prompt either way.
      navigator.serviceWorker.ready
        .then(reg => reg.pushManager.getSubscription())
        .then(sub => { if (!sub) subscribe().catch(() => {}) })
        .catch(() => {})
      return
    }

    // permission === 'default' — genuinely never asked yet.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVisible(true)
  }, [])

  async function enable() {
    setSubscribing(true)
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') return
      await subscribe()
    } catch {
      // ignore — the banner just won't have appeared as dismissed, so it offers again next visit
    } finally {
      setSubscribing(false)
      setVisible(false)
    }
  }

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, '1')
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 12, padding: '12px 14px', marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <p style={{ fontSize: 12, color: '#1E40AF', margin: 0, lineHeight: 1.5 }}>
          Turn on notifications so you don&apos;t miss overdue alerts, reminders, and approvals — even when the app is closed.
        </p>
        <button
          className="mtap"
          onClick={dismiss}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#1E40AF', fontSize: 16, lineHeight: 1, flexShrink: 0, padding: 0 }}
        >
          ×
        </button>
      </div>
      <button
        className="mtap"
        onClick={enable}
        disabled={subscribing}
        style={{ alignSelf: 'flex-start', padding: '6px 14px', borderRadius: 8, border: 'none', background: '#1D4ED8', color: '#fff', fontSize: 11, fontWeight: 600, cursor: subscribing ? 'not-allowed' : 'pointer', fontFamily: 'Poppins, sans-serif' }}
      >
        {subscribing ? 'Enabling…' : 'Enable notifications'}
      </button>
    </div>
  )
}
