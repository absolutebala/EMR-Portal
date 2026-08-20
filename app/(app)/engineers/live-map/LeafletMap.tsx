'use client'

import { useEffect, useRef } from 'react'
import Link from 'next/link'
import L from 'leaflet'
import { MapContainer, TileLayer, Marker, Popup, Tooltip, Polyline, useMap } from 'react-leaflet'
import type { LatLngBoundsExpression } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { FieldEngineerOverview } from '@/app/actions/get-engineers'

// Small per-page status color/label map, matching the convention already used
// elsewhere in this app (e.g. EngineersPageClient.tsx, dashboard/page.tsx) of
// duplicating this tiny config per file rather than sharing one module.
const STATUS_CFG: Record<string, { bg: string; color: string; label: string }> = {
  available: { bg: '#D1FAE5', color: '#065F46', label: 'Available' },
  on_leave: { bg: '#F1F5F9', color: '#475569', label: 'On Leave' },
  on_the_way: { bg: '#DBEAFE', color: '#1D4ED8', label: 'On the way' },
  travelling: { bg: '#EDE9FE', color: '#5B21B6', label: 'Travelling' },
  reached: { bg: '#FEF3C7', color: '#92400E', label: 'Reached project' },
  completed: { bg: '#D1FAE5', color: '#065F46', label: 'Completed' },
}

function formatRelativeTime(at: string): string {
  const ageMs = Date.now() - new Date(at).getTime()
  const mins = Math.round(ageMs / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours} hr ago`
  const days = Math.round(hours / 24)
  return `${days} day${days !== 1 ? 's' : ''} ago`
}

// Classic "map pin" teardrop shape (a rotated rounded square) in the app's brand
// maroon, with an upright person glyph inside — built as a divIcon (inline HTML/SVG)
// rather than an external image file, so there's no icon asset to host or a bundler
// asset-path issue to work around (the well-known reason Leaflet's *default* marker
// icon breaks under most bundlers, Next.js included).
const TECHNICIAN_ICON = L.divIcon({
  className: 'technician-marker',
  html: `
    <div style="width:32px;height:32px;border-radius:50% 50% 50% 0;background:#7D1D3F;transform:rotate(-45deg);border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;">
      <div style="transform:rotate(45deg);display:flex;">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="#fff"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4.4 3.6-8 8-8s8 3.6 8 8"/></svg>
      </div>
    </div>
  `,
  iconSize: [32, 32],
  iconAnchor: [16, 32],
  popupAnchor: [0, -30],
})

const INDIA_CENTER: [number, number] = [22.9734, 78.6569]

// Faded, smaller pin used for an engineer's earlier check-in locations (the "trail"
// shown once they're selected from the list) — same teardrop shape as the current-
// position marker but visually de-emphasized so it reads as history, not "also here now".
const HISTORY_ICON = L.divIcon({
  className: 'technician-history-marker',
  html: `
    <div style="width:20px;height:20px;border-radius:50% 50% 50% 0;background:#B98A9B;transform:rotate(-45deg);border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,0.3);opacity:0.85;"></div>
  `,
  iconSize: [20, 20],
  iconAnchor: [10, 20],
  popupAnchor: [0, -18],
})

// Two engineers can ping from coordinates that only differ a few meters apart (e.g.
// both checked in from the same office) — round to ~111m grid cells to detect those
// clusters, then nudge every point after the first outward along a golden-angle
// spiral so overlapping pins become visually distinguishable instead of stacking
// into what looks like a single marker.
const GOLDEN_ANGLE = 137.508 * (Math.PI / 180)
function jitterOverlapping<T extends { lat: number; lng: number }>(items: T[]): T[] {
  const clusters = new Map<string, T[]>()
  items.forEach(item => {
    const key = `${item.lat.toFixed(3)},${item.lng.toFixed(3)}`
    const list = clusters.get(key)
    if (list) list.push(item)
    else clusters.set(key, [item])
  })

  const result: T[] = []
  clusters.forEach(group => {
    group.forEach((item, i) => {
      if (i === 0) {
        result.push(item)
        return
      }
      const angle = i * GOLDEN_ANGLE
      const radius = 0.00012 * Math.sqrt(i)
      result.push({ ...item, lat: item.lat + radius * Math.cos(angle), lng: item.lng + radius * Math.sin(angle) })
    })
  })
  return result
}

// Leaflet has no declarative "fit to markers" prop — this reaches into the map
// instance imperatively via useMap(), the documented way to do it with react-leaflet.
// Only runs once (the first time real bounds are available), not on every data
// refresh — otherwise the periodic 60s auto-refresh would silently reset the admin's
// own pan/zoom every minute.
function FitBounds({ bounds }: { bounds: LatLngBoundsExpression | null }) {
  const map = useMap()
  const hasFit = useRef(false)
  useEffect(() => {
    if (bounds && !hasFit.current) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 12 })
      hasFit.current = true
    }
  }, [map, bounds])
  return null
}

function FlyToSelected({ target }: { target: [number, number] | null }) {
  const map = useMap()
  useEffect(() => {
    if (target) map.flyTo(target, Math.max(map.getZoom(), 13))
  }, [map, target])
  return null
}

interface Props {
  engineers: FieldEngineerOverview[]
  selectedId: string | null
  // Earlier check-in locations for whichever engineer is selected, most recent
  // first — fetched by the parent on selection, not all-engineers-at-once (would be
  // a lot of unused data fetched on every load for a trail that's only ever shown
  // for one engineer at a time).
  history: { placeName: string | null; at: string; lat: number; lng: number }[]
}

export default function LeafletMap({ engineers, selectedId, history }: Props) {
  const rawPoints = engineers.flatMap(e => {
    const ls = e.lastSeen
    if (!ls || ls.lat == null || ls.lng == null) return []
    return [{ engineer: e, lat: ls.lat, lng: ls.lng, at: ls.at, placeName: ls.placeName }]
  })
  const points = jitterOverlapping(rawPoints)
  const bounds: LatLngBoundsExpression | null = points.length ? points.map(p => [p.lat, p.lng] as [number, number]) : null
  const selected = points.find(p => p.engineer.id === selectedId)

  const markerRefs = useRef<Record<string, L.Marker | null>>({})
  useEffect(() => {
    if (selectedId) markerRefs.current[selectedId]?.openPopup()
  }, [selectedId])

  // Skip the first history row — it's the same check-in already shown as the
  // current position above, so it would otherwise render as a redundant history pin
  // right on top of the live one.
  const trail = selected ? history.filter(h => !(h.lat === selected.lat && h.lng === selected.lng)).slice(0, 5) : []
  const trailLine: [number, number][] = selected
    ? [[selected.lat, selected.lng], ...trail.map(h => [h.lat, h.lng] as [number, number])]
    : []

  return (
    <MapContainer center={INDIA_CENTER} zoom={5} style={{ width: '100%', height: '100%' }}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitBounds bounds={bounds} />
      <FlyToSelected target={selected ? [selected.lat, selected.lng] : null} />
      {points.map(p => {
        const statusCfg = STATUS_CFG[p.engineer.status] || STATUS_CFG.available
        return (
          <Marker
            key={p.engineer.id}
            position={[p.lat, p.lng]}
            icon={TECHNICIAN_ICON}
            ref={el => { markerRefs.current[p.engineer.id] = el }}
          >
            <Tooltip direction="top" offset={[0, -30]} permanent opacity={0.95}>
              {p.engineer.name}
            </Tooltip>
            <Popup>
              <div style={{ fontFamily: 'Poppins, sans-serif', minWidth: 160 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#1C0D14', marginBottom: 4 }}>{p.engineer.name}</div>
                <span style={{ fontSize: 10, fontWeight: 600, background: statusCfg.bg, color: statusCfg.color, borderRadius: 20, padding: '2px 8px' }}>
                  {statusCfg.label}
                </span>
                <div style={{ fontSize: 11, color: '#7A6870', marginTop: 6 }}>{p.placeName || 'Location unavailable'}</div>
                <div style={{ fontSize: 10, color: '#9CA3AF', marginTop: 2 }}>Last seen {formatRelativeTime(p.at)}</div>
                <Link href={`/engineers/${p.engineer.id}`} style={{ display: 'inline-block', marginTop: 8, fontSize: 11, color: '#7D1D3F', fontWeight: 500 }}>
                  View profile →
                </Link>
              </div>
            </Popup>
          </Marker>
        )
      })}
      {trail.map((h, i) => (
        <Marker key={`hist-${i}-${h.at}`} position={[h.lat, h.lng]} icon={HISTORY_ICON}>
          <Popup>
            <div style={{ fontFamily: 'Poppins, sans-serif', minWidth: 140 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#7A6870' }}>Previous location</div>
              <div style={{ fontSize: 11, color: '#7A6870', marginTop: 4 }}>{h.placeName || 'Location unavailable'}</div>
              <div style={{ fontSize: 10, color: '#9CA3AF', marginTop: 2 }}>{formatRelativeTime(h.at)}</div>
            </div>
          </Popup>
        </Marker>
      ))}
      {trailLine.length > 1 && (
        <Polyline positions={trailLine} pathOptions={{ color: '#B98A9B', weight: 2, dashArray: '4 6', opacity: 0.8 }} />
      )}
    </MapContainer>
  )
}
