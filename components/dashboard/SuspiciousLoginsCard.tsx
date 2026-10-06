'use client'

import { useState, useEffect } from 'react'
import Modal from '@/components/ui/Modal'
import { ListCard, ListRow, Badge } from '@/components/dashboard/DashboardCards'
import { geocodeLoginPlace } from '@/app/actions/login-events'
import type { SuspiciousLoginFlag } from '@/lib/mobile/core/loginEvents'

function formatTime(d: string) {
  return new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true })
}

function kindLabel(f: SuspiciousLoginFlag) {
  const both = f.kinds.includes('impossible_travel') && f.kinds.includes('multi_device')
  if (both) return 'Impossible travel · 2 devices'
  return f.kinds.includes('impossible_travel') ? 'Impossible travel' : '2+ devices'
}

// Clickable version of the dashboard's "Suspicious logins" card: each row opens a
// detail popup listing every device the engineer logged in from — its name, where it
// last logged in from, and when — so an admin can eyeball whether a "2 devices" flag is
// a real second phone or just the same person reinstalling.
const coordKey = (lat: number, lng: number) => `${lat},${lng}`

export default function SuspiciousLoginsCard({ flags }: { flags: SuspiciousLoginFlag[] }) {
  const [selected, setSelected] = useState<SuspiciousLoginFlag | null>(null)
  // Coordinate → resolved place label, filled in lazily when a detail popup opens for
  // logins recorded before the app captured place names itself (older builds send GPS
  // only). Cached across popups so the same spot is never geocoded twice.
  const [places, setPlaces] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!selected) return
    let cancelled = false
    // Every point shown in the popup that lacks a stored place name: each device's
    // last-seen, plus the active device's first-login-after-switch (handover).
    const points: [number | null, number | null, string | null][] = selected.devices.map(d => [d.lastLatitude, d.lastLongitude, d.lastPlaceName])
    if (selected.handover) points.push([selected.handover.newLatitude, selected.handover.newLongitude, selected.handover.newPlaceName])
    for (const [lat, lng, place] of points) {
      if (place || lat == null || lng == null) continue
      const key = coordKey(lat, lng)
      if (places[key] !== undefined) continue
      geocodeLoginPlace(lat, lng).then(label => {
        if (!cancelled && label) setPlaces(prev => ({ ...prev, [key]: label }))
      })
    }
    return () => { cancelled = true }
  }, [selected, places])

  // The currently-active device = the one with the most recent login. Single-device
  // enforcement makes the newest login the active session, so the device whose last
  // login is latest is the one signed in now.
  const activeIdx = selected && selected.devices.length
    ? selected.devices.reduce((best, d, i, arr) => new Date(d.lastSeen).getTime() > new Date(arr[best].lastSeen).getTime() ? i : best, 0)
    : -1

  return (
    <>
      <ListCard title="Suspicious logins" viewAllHref="/engineers" empty="No suspicious logins — all clear.">
        {flags.slice(0, 6).map(f => (
          <ListRow key={f.engineerId} title={f.engineerName} subtitle={`${f.detail} · ${formatTime(f.at)}`} onClick={() => setSelected(f)}>
            <Badge bg="#FEE2E2" color="#991B1B" label={kindLabel(f)} />
          </ListRow>
        ))}
      </ListCard>

      <Modal open={!!selected} onClose={() => setSelected(null)} title={selected ? `${selected.engineerName} — login devices` : ''} size="md">
        {selected && (
          <div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
              {selected.kinds.includes('impossible_travel') && <Badge bg="#FEE2E2" color="#991B1B" label="Impossible travel" />}
              {selected.kinds.includes('multi_device') && <Badge bg="#FEE2E2" color="#991B1B" label={`${selected.devices.length} devices`} />}
            </div>
            <div style={{ fontSize: 12, color: 'var(--txm)', marginBottom: 14 }}>{selected.detail}</div>

            {selected.handover && selected.handover.distanceKm != null && (
              <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 12, color: '#991B1B' }}>
                <strong>≈ {Math.round(selected.handover.distanceKm)} km</strong> between where the previous device was last used and where the new device first signed in.
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {selected.devices.map((d, i) => {
                const isActive = i === activeIdx
                // Active device → show its first login AFTER the switch (handover);
                // previous devices → show their last-seen.
                const h = isActive ? selected.handover : null
                const lat = h ? h.newLatitude : d.lastLatitude
                const lng = h ? h.newLongitude : d.lastLongitude
                const placeName = h ? h.newPlaceName : d.lastPlaceName
                const when = h ? h.newFirstLogin : d.lastSeen
                const whenLabel = h ? 'First login (after switch)' : 'Last seen'
                const resolved = lat != null && lng != null ? places[coordKey(lat, lng)] : undefined
                const loc = placeName || resolved || (lat != null && lng != null ? `${lat.toFixed(4)}, ${lng.toFixed(4)}` : null)
                const mapHref = lat != null && lng != null ? `https://www.google.com/maps?q=${lat},${lng}` : null
                return (
                  <div key={d.deviceId || i} style={{ border: '1px solid var(--gm)', borderRadius: 10, padding: '12px 14px', background: '#FAFAFA' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--tx)' }}>{d.deviceName || 'Unknown device'}</span>
                        {isActive && <span style={{ fontSize: 9.5, fontWeight: 700, color: '#065F46', background: '#D1FAE5', borderRadius: 20, padding: '2px 8px', whiteSpace: 'nowrap' }}>Currently active</span>}
                      </span>
                      <span style={{ fontSize: 10, color: 'var(--txm)' }}>{d.loginCount} login{d.loginCount !== 1 ? 's' : ''}</span>
                    </div>
                    <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, color: 'var(--txm)' }}>
                      <div>
                        <span style={{ fontWeight: 600, color: 'var(--tx)' }}>Location: </span>
                        {loc ? (mapHref ? <a href={mapHref} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--m)', textDecoration: 'none' }}>{loc} ↗</a> : loc) : 'No location captured'}
                      </div>
                      <div>
                        <span style={{ fontWeight: 600, color: 'var(--tx)' }}>{whenLabel}: </span>
                        {formatTime(when)}
                      </div>
                      {!d.deviceName && (
                        <div style={{ fontSize: 10, color: 'var(--txm)', fontStyle: 'italic' }}>
                          Device name is captured from the updated app — older logins show as unknown.
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </Modal>
    </>
  )
}
