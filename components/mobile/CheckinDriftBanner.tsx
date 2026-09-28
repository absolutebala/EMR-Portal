'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { checkCheckinDrift } from '@/app/actions/mobile-actions'
import type { CheckinDriftNotice } from '@/lib/mobile/core/shared'

// PWA counterpart of the native app's CheckinDriftBanner. On dashboard load it captures
// GPS and asks the server whether the engineer is 2km+ from where they checked in while
// still "Reached" — if so, a maroon banner nudges them to update the notification's
// status. Rendered inline at the top of the dashboard content (not a floating overlay),
// which suits the PWA's scroll layout.
export default function CheckinDriftBanner() {
  const router = useRouter()
  const [notice, setNotice] = useState<CheckinDriftNotice | null>(null)

  useEffect(() => {
    if (!navigator.geolocation) return
    let cancelled = false
    navigator.geolocation.getCurrentPosition(
      pos => {
        checkCheckinDrift(pos.coords.latitude, pos.coords.longitude)
          .then(({ notice }) => { if (!cancelled && notice) setNotice(notice) })
          .catch(() => {})
      },
      () => {},
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60_000 }
    )
    return () => { cancelled = true }
  }, [])

  if (!notice) return null

  return (
    <button
      className="mtap"
      onClick={() => router.push(`/mobile/work-orders/${notice.workOrderId}`)}
      style={{
        width: '100%', textAlign: 'center', background: '#7D1D3F', color: '#fff', border: 'none',
        borderRadius: 10, padding: '9px 12px', marginBottom: 12, fontSize: 11, fontWeight: 600,
        cursor: 'pointer', fontFamily: 'Poppins, sans-serif',
      }}
    >
      You&apos;re ~{notice.distanceKm < 1 ? '<1' : Math.round(notice.distanceKm)} km from {notice.projectLabel} — update the notification&apos;s status if you&apos;ve left
    </button>
  )
}
