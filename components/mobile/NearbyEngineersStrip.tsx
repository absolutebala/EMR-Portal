'use client'

import { useCallback, useEffect, useState } from 'react'
import { getNearbyEngineers } from '@/app/actions/mobile-actions'
import type { NearbyEngineer } from '@/lib/mobile/core/nearby'

const DEFAULT_RADIUS_KM = 10

function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '?'
}

function formatDistance(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`
}

// PWA counterpart of the native app's NearbyEngineersStrip. Sits after the recent-jobs
// list. Radius is local state (default 10km, tap the pill to edit); changing it re-reads
// GPS and re-queries the server, which filters by the actual radius.
export default function NearbyEngineersStrip() {
  const [radiusKm, setRadiusKm] = useState(DEFAULT_RADIUS_KM)
  const [engineers, setEngineers] = useState<NearbyEngineer[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [draftRadius, setDraftRadius] = useState(String(DEFAULT_RADIUS_KM))

  const load = useCallback((radius: number) => {
    setLoading(true)
    if (!navigator.geolocation) { setLoading(false); return }
    navigator.geolocation.getCurrentPosition(
      pos => {
        getNearbyEngineers(pos.coords.latitude, pos.coords.longitude, radius)
          .then(({ engineers }) => setEngineers(engineers || []))
          .catch(() => {})
          .finally(() => setLoading(false))
      },
      () => setLoading(false),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60_000 }
    )
  }, [])

  // load() flips a loading flag then resolves async — the geolocation/network work and
  // its setState happen in callbacks, not synchronously, despite the lint heuristic.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(radiusKm) }, [radiusKm, load])

  function saveRadius() {
    const n = Number(draftRadius)
    if (Number.isFinite(n) && n > 0) setRadiusKm(Math.min(n, 999))
    setEditing(false)
  }

  return (
    <div style={{ marginTop: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <p style={{ fontSize: 10, fontWeight: 600, color: '#7A6870', textTransform: 'uppercase', letterSpacing: 0.5, margin: 0 }}>Nearby Engineers</p>
        <button className="mtap" onClick={() => { setDraftRadius(String(radiusKm)); setEditing(true) }}
          style={{ background: '#F9EEF2', border: '1px solid #E8C5D0', borderRadius: 999, padding: '5px 12px', fontSize: 11, fontWeight: 700, color: '#7D1D3F', cursor: 'pointer', fontFamily: 'Poppins, sans-serif' }}>
          within {radiusKm} km
        </button>
      </div>

      {loading ? (
        <p style={{ fontSize: 12, color: '#9CA3AF', padding: '8px 0', margin: 0 }}>Finding nearby engineers…</p>
      ) : engineers.length === 0 ? (
        <p style={{ fontSize: 12, color: '#9CA3AF', padding: '8px 0', margin: 0 }}>No other engineers within {radiusKm} km right now</p>
      ) : (
        <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 4 }}>
          {engineers.map(e => (
            <div key={e.id} style={{ width: 76, flexShrink: 0, textAlign: 'center' }}>
              <div style={{ width: 52, height: 52, borderRadius: 26, background: '#F9EEF2', border: '1.5px solid #E8C5D0', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', margin: '0 auto 6px' }}>
                {e.avatarUrl
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={e.avatarUrl} alt={e.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <span style={{ fontSize: 16, fontWeight: 700, color: '#7D1D3F' }}>{initials(e.name)}</span>}
              </div>
              <div style={{ fontSize: 10.5, fontWeight: 600, color: '#1C0D14', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.name}</div>
              <div style={{ fontSize: 10, color: '#7A6870', marginTop: 1 }}>{formatDistance(e.distanceKm)}</div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <div onClick={() => setEditing(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.25)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, padding: 20, width: 240, fontFamily: 'Poppins, sans-serif' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#1C0D14', marginBottom: 12, textAlign: 'center' }}>Search radius</div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 16 }}>
              <input value={draftRadius} onChange={e => setDraftRadius(e.target.value)} inputMode="numeric" autoFocus
                onKeyDown={e => { if (e.key === 'Enter') saveRadius() }}
                style={{ border: '1.5px solid #E5E0E3', borderRadius: 10, padding: '10px 14px', fontSize: 18, fontWeight: 700, color: '#1C0D14', width: 90, textAlign: 'center', fontFamily: 'Poppins, sans-serif', boxSizing: 'border-box' }} />
              <span style={{ fontSize: 14, fontWeight: 600, color: '#7A6870' }}>km</span>
            </div>
            <button className="mtap" onClick={saveRadius}
              style={{ width: '100%', background: '#7D1D3F', color: '#fff', border: 'none', borderRadius: 10, padding: 11, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'Poppins, sans-serif' }}>
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
