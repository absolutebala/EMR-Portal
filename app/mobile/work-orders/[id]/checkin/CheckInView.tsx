'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import MobileHeader from '@/components/mobile/MobileHeader'
import { reverseGeocode } from '@/app/actions/mobile-actions'
import type { MobileWorkOrderWithCustomer } from '@/app/actions/mobile-actions'
import { compressImage } from '@/lib/mobile/compressImage'
import { startBackgroundCheckIn } from '@/lib/mobile/backgroundCheckIn'

interface Props {
  workOrder: MobileWorkOrderWithCustomer
}

export default function CheckInView({ workOrder }: Props) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [placeName, setPlaceName] = useState('')
  const [gpsError, setGpsError] = useState('')
  const [photo, setPhoto] = useState<{ dataUrl: string; mimeType: string; ext: string } | null>(null)
  const [compressing, setCompressing] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!('geolocation' in navigator)) {
      const t = setTimeout(() => setGpsError('GPS not available on this device'), 0)
      return () => clearTimeout(t)
    }
    navigator.geolocation.getCurrentPosition(
      pos => setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {
        // High-accuracy (GPS hardware) failed or timed out — common indoors or
        // on a weak signal. Fall back to low-accuracy (WiFi/network-based)
        // positioning, which resolves faster and more reliably at the cost of
        // precision, before giving up entirely.
        navigator.geolocation.getCurrentPosition(
          pos => setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
          () => setGpsError('Could not get location — you can still check in without it'),
          { enableHighAccuracy: false, timeout: 10000 }
        )
      },
      { enableHighAccuracy: true, timeout: 12000 }
    )
  }, [])

  useEffect(() => {
    if (!coords) return
    let cancelled = false
    reverseGeocode(coords.lat, coords.lng).then(({ label }) => {
      if (!cancelled && label) setPlaceName(label)
    })
    return () => { cancelled = true }
  }, [coords])

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError('')
    setCompressing(true)
    try {
      const dataUrl = await compressImage(file)
      setPhoto({ dataUrl, mimeType: 'image/jpeg', ext: 'jpg' })
    } catch {
      setError('Could not process that photo — please try again')
    } finally {
      setCompressing(false)
    }
  }

  function handleSubmit() {
    if (!photo) { setError('Photo proof is required'); return }
    setSubmitting(true)
    setError('')

    // Fire the check-in request in the background and move on immediately — the request
    // keeps running after navigation and the hub picks up the result (see backgroundCheckIn).
    startBackgroundCheckIn({
      workOrderId: workOrder.id,
      latitude: coords?.lat ?? null,
      longitude: coords?.lng ?? null,
      placeName: placeName || null,
      photoBase64: photo.dataUrl,
      mimeType: photo.mimeType,
      ext: photo.ext,
    })
    router.push(`/mobile/work-orders/${workOrder.id}`)
  }

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', background: '#F8F5F6' }}>
      <MobileHeader title="Project Check-In" backHref={`/mobile/work-orders/${workOrder.id}`} rightSlot={
        <span style={{ background: '#DBEAFE', color: '#1E40AF', fontSize: 10, fontWeight: 600, borderRadius: 20, padding: '3px 10px' }}>
          {workOrder.wo_number}
        </span>
      } />

      <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        <div style={{ background: '#F9EEF2', border: '1px solid #E8C5D0', color: '#7D1D3F', borderRadius: 10, padding: '9px 12px', marginBottom: 12, fontSize: 11, lineHeight: 1.5 }}>
          Check-in required before starting work. GPS location and photo will be captured.
        </div>

        {/* GPS capture */}
        <div style={{
          background: coords ? 'linear-gradient(135deg,#065F46,#059669)' : 'linear-gradient(135deg,#1E3A5F,#2563EB)',
          borderRadius: 12, padding: 16, textAlign: 'center', marginBottom: 12,
        }}>
          <div style={{ width: 48, height: 48, background: 'rgba(255,255,255,0.15)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px' }}>
            <svg width="22" height="22" fill="none" stroke="white" strokeWidth="2" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="3" /><line x1="12" y1="1" x2="12" y2="4" /><line x1="12" y1="20" x2="12" y2="23" />
              <line x1="1" y1="12" x2="4" y2="12" /><line x1="20" y1="12" x2="23" y2="12" />
            </svg>
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', marginBottom: 3 }}>
            {coords ? (placeName || 'GPS location captured') : gpsError ? 'GPS unavailable' : 'GPS location capturing...'}
          </div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)' }}>
            {coords ? `${coords.lat.toFixed(4)}° N, ${coords.lng.toFixed(4)}° E` : gpsError || 'Locating · please wait'}
          </div>
        </div>

        <div style={{ background: '#fff', borderRadius: 13, padding: 13, marginBottom: 12, boxShadow: '0 1px 4px rgba(125,29,63,0.05)' }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: '#1C0D14', marginBottom: 10 }}>Check-in details</p>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 12 }}>
            <span style={{ color: '#7A6870' }}>Customer project</span>
            <span style={{ fontWeight: 500 }}>{workOrder.site_name || workOrder.customer_name}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 12 }}>
            <span style={{ color: '#7A6870' }}>Now</span>
            <span style={{ fontWeight: 500 }}>{new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
        </div>

        <div style={{ background: '#fff', borderRadius: 13, padding: 13, marginBottom: 12, boxShadow: '0 1px 4px rgba(125,29,63,0.05)' }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: '#1C0D14', marginBottom: 2 }}>
            Photo proof <span style={{ color: '#7D1D3F' }}>*</span>
          </p>
          <p style={{ fontSize: 11, color: '#7A6870', marginBottom: 8 }}>Capture a photo confirming your arrival at the customer site.</p>

          <input ref={fileInputRef} type="file" accept="image/*" capture="environment" onChange={handlePhotoChange} style={{ display: 'none' }} />

          {compressing ? (
            <div style={{ border: '1.5px dashed #E8C5D0', borderRadius: 11, padding: 18, textAlign: 'center', background: '#F9EEF2' }}>
              <p style={{ fontSize: 11, fontWeight: 500, color: '#7D1D3F', margin: 0 }}>Processing photo…</p>
            </div>
          ) : !photo ? (
            <div
              className="mtap"
              onClick={() => fileInputRef.current?.click()}
              style={{ border: '1.5px dashed #E8C5D0', borderRadius: 11, padding: 18, textAlign: 'center', cursor: 'pointer', background: '#F9EEF2' }}
            >
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#7D1D3F" strokeWidth="1.5" style={{ display: 'block', margin: '0 auto 6px', opacity: 0.6 }}>
                <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" /><circle cx="12" cy="13" r="4" />
              </svg>
              <p style={{ fontSize: 11, fontWeight: 500, color: '#7D1D3F', margin: 0 }}>Tap to capture site arrival photo</p>
            </div>
          ) : (
            <div className="mtap" onClick={() => fileInputRef.current?.click()} style={{ background: '#ECFDF5', border: '1.5px solid #A7F3D0', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 8, padding: '9px 11px', cursor: 'pointer' }}>
              <img src={photo.dataUrl} alt="Check-in" style={{ width: 34, height: 34, objectFit: 'cover', borderRadius: 7, flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: 11, fontWeight: 500, color: '#065F46' }}>1 photo captured</div>
                <div style={{ fontSize: 10, color: '#059669' }}>Tap to retake</div>
              </div>
            </div>
          )}
        </div>

        {error && (
          <div style={{ background: '#FEE2E2', color: '#DC2626', borderRadius: 10, padding: '10px 12px', fontSize: 12, marginBottom: 12 }}>
            {error}
          </div>
        )}

        <button
          className="mtap"
          onClick={handleSubmit}
          disabled={!photo || submitting || compressing}
          style={{
            width: '100%', padding: '14px', borderRadius: 12, border: 'none',
            background: !photo || submitting || compressing ? '#A8294F' : '#2563EB', color: '#fff',
            fontSize: 14, fontWeight: 600, cursor: !photo || submitting || compressing ? 'not-allowed' : 'pointer',
            fontFamily: 'Poppins, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}
        >
          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" /><circle cx="12" cy="10" r="3" />
          </svg>
          {submitting ? 'Checking in…' : 'Confirm check-in — Reached Project'}
        </button>
      </div>
    </div>
  )
}
