'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'

// Location access is a hard requirement for field engineers — the whole point of the
// app is knowing where they are. Gated everywhere except the screens someone has to
// reach before they're even a logged-in field engineer with a reason to share it.
const UNGATED_PATHS = ['/mobile/login', '/mobile/install', '/mobile/change-password']

type Status = 'checking' | 'granted' | 'blocked'

export default function LocationGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [status, setStatus] = useState<Status>('checking')

  const gated = !UNGATED_PATHS.some(p => pathname?.startsWith(p))

  useEffect(() => {
    if (!gated) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStatus('granted')
      return
    }
    if (!navigator.geolocation) {
      setStatus('granted') // nothing to gate on
      return
    }

    let cancelled = false
    let permissionStatus: PermissionStatus | null = null

    function requestFix() {
      navigator.geolocation.getCurrentPosition(
        () => { if (!cancelled) setStatus('granted') },
        err => {
          if (cancelled) return
          // GeolocationPositionError codes: 1 = PERMISSION_DENIED (the only one that
          // means "blocked"), 2 = POSITION_UNAVAILABLE, 3 = TIMEOUT — both of the
          // latter mean permission IS granted, just no fix yet (common at field
          // sites with poor signal), so those must not lock the engineer out.
          setStatus(err.code === 1 ? 'blocked' : 'granted')
        },
        { enableHighAccuracy: false, timeout: 15000, maximumAge: 5 * 60 * 1000 }
      )
    }

    if (navigator.permissions?.query) {
      navigator.permissions.query({ name: 'geolocation' }).then(result => {
        if (cancelled) return
        permissionStatus = result
        if (result.state === 'denied') { setStatus('blocked'); return }
        if (result.state === 'granted') { setStatus('granted'); return }
        requestFix() // 'prompt' — ask now so we learn the real answer
        result.onchange = () => { if (!cancelled && result.state === 'granted') setStatus('granted') }
      }).catch(requestFix) // Permissions API present but 'geolocation' query unsupported
    } else {
      requestFix() // Safari and other browsers without the Permissions API
    }

    return () => { cancelled = true; if (permissionStatus) permissionStatus.onchange = null }
  }, [gated, pathname])

  // Re-check when they come back from Settings — permissions.onchange doesn't fire on
  // every browser, but tab focus reliably does whenever they switch back to the app.
  useEffect(() => {
    if (status !== 'blocked') return
    function recheck() {
      navigator.geolocation.getCurrentPosition(
        () => setStatus('granted'),
        () => {},
        { enableHighAccuracy: false, timeout: 8000, maximumAge: 0 }
      )
    }
    window.addEventListener('focus', recheck)
    document.addEventListener('visibilitychange', recheck)
    return () => {
      window.removeEventListener('focus', recheck)
      document.removeEventListener('visibilitychange', recheck)
    }
  }, [status])

  if (!gated || status === 'granted') return <>{children}</>

  if (status === 'checking') {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F8F5F6' }}>
        <div style={{ width: 28, height: 28, border: '3px solid #E5E0E3', borderTopColor: '#7D1D3F', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', background: '#3A0A1C', color: '#fff' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 28, textAlign: 'center' }}>
        <div style={{ width: 60, height: 60, borderRadius: '50%', background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
          <svg width="28" height="28" fill="none" stroke="#fff" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" /><circle cx="12" cy="10" r="3" />
          </svg>
        </div>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Location access is required</div>
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)', lineHeight: 1.6, maxWidth: 320, margin: 0 }}>
          The EMR Field App needs your location to work — your supervisor and the job records depend on it.
          Please allow location access in your browser&apos;s site settings, then come back here.
        </p>
        <div style={{ marginTop: 20, padding: '10px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.08)', fontSize: 11, color: 'rgba(255,255,255,0.65)', maxWidth: 320, lineHeight: 1.6 }}>
          Chrome: tap the lock icon next to the address bar → Permissions → Location → Allow.
        </div>
        <button
          className="mtap"
          onClick={() => {
            setStatus('checking')
            navigator.geolocation.getCurrentPosition(
              () => setStatus('granted'),
              err => setStatus(err.code === 1 ? 'blocked' : 'granted'),
              { enableHighAccuracy: false, timeout: 15000, maximumAge: 0 }
            )
          }}
          style={{ marginTop: 22, padding: '12px 28px', borderRadius: 10, border: 'none', background: '#7D1D3F', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'Poppins, sans-serif' }}
        >
          Try again
        </button>
      </div>
    </div>
  )
}
