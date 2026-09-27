import { recordWebLoginEvent } from '@/app/actions/login-events'

// Browser-side counterpart of the native app's loginEvent helper. Runs in the PWA login
// page after a successful sign-in; mirrors what the native app captures so PWA logins
// feed the same suspicious-login detection. Best-effort throughout — never throws.

const DEVICE_ID_KEY = 'emr_device_id'

// Stable per-browser device id (persisted in localStorage). Clearing site data mints a
// new one — acceptable for "which device is this login from", same as the native app's
// AsyncStorage id.
function getDeviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_ID_KEY)
    if (!id) {
      id = `web-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
      localStorage.setItem(DEVICE_ID_KEY, id)
    }
    return id
  } catch {
    return 'unknown'
  }
}

// A human-friendly-ish label from the user agent — the browser can't expose a real
// device model, so this is "<Browser> on <OS> · Web" to distinguish it from the native
// app and from other browsers in the suspicious-login detail.
function getDeviceName(): string | null {
  try {
    const ua = navigator.userAgent
    const os = /Android/i.test(ua) ? 'Android'
      : /iPhone|iPad|iPod/i.test(ua) ? 'iOS'
      : /Windows/i.test(ua) ? 'Windows'
      : /Mac OS X/i.test(ua) ? 'macOS'
      : /Linux/i.test(ua) ? 'Linux' : 'Unknown OS'
    const browser = /Edg\//i.test(ua) ? 'Edge'
      : /OPR\/|Opera/i.test(ua) ? 'Opera'
      : /Chrome\//i.test(ua) ? 'Chrome'
      : /Firefox\//i.test(ua) ? 'Firefox'
      : /Safari\//i.test(ua) ? 'Safari' : 'Browser'
    return `${browser} on ${os} · Web`
  } catch {
    return 'Web'
  }
}

function getPosition(timeoutMs: number): Promise<{ lat: number; lng: number } | null> {
  return new Promise(resolve => {
    if (!('geolocation' in navigator)) { resolve(null); return }
    let settled = false
    const done = (v: { lat: number; lng: number } | null) => { if (!settled) { settled = true; resolve(v) } }
    // Our own guard in case the browser never calls back (e.g. permission prompt ignored).
    const timer = setTimeout(() => done(null), timeoutMs)
    navigator.geolocation.getCurrentPosition(
      pos => { clearTimeout(timer); done({ lat: pos.coords.latitude, lng: pos.coords.longitude }) },
      () => { clearTimeout(timer); done(null) },
      { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 60_000 }
    )
  })
}

export async function recordPwaLoginEvent(): Promise<void> {
  try {
    const deviceId = getDeviceId()
    const deviceName = getDeviceName()
    const pos = await getPosition(8000)
    await recordWebLoginEvent({ deviceId, deviceName, latitude: pos?.lat ?? null, longitude: pos?.lng ?? null })
  } catch {
    // best-effort only
  }
}
