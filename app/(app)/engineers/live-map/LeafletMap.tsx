'use client'

import { useEffect, useRef } from 'react'
import Link from 'next/link'
import L from 'leaflet'
import { MapContainer, TileLayer, Marker, Popup, Tooltip, useMap } from 'react-leaflet'
import type { LatLngBoundsExpression } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { FieldEngineerOverview } from '@/app/actions/get-engineers'

// Small per-page status color/label map, matching the convention already used
// elsewhere in this app (e.g. EngineersPageClient.tsx, dashboard/page.tsx) of
// duplicating this tiny config per file rather than sharing one module.
const STATUS_CFG: Record<string, { bg: string; color: string; label: string }> = {
  available: { bg: '#D1FAE5', color: '#065F46', label: 'Available' },
  unavailable: { bg: '#F3F4F6', color: '#6B7280', label: 'Unavailable' },
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
// Mainland India bounding box (SW → NE), used to frame the whole country on first
// load so the admin sees how engineers are spread out nationally rather than being
// zoomed straight into wherever the pins happen to cluster.
const INDIA_BOUNDS: LatLngBoundsExpression = [[6.5, 68.0], [35.7, 97.5]]

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

// Frame the whole of India once on first load (the documented react-leaflet way is to
// reach into the map instance imperatively via useMap()). Fitting a fixed India box —
// rather than the marker bounds — means the admin always opens on the national view and
// can see how engineers are spread across the country, instead of being zoomed into
// wherever the pins happen to cluster. Runs only once, so the 60s auto-refresh never
// resets the admin's own pan/zoom.
function FitIndia() {
  const map = useMap()
  const hasFit = useRef(false)
  useEffect(() => {
    if (!hasFit.current) {
      map.fitBounds(INDIA_BOUNDS, { padding: [20, 20] })
      hasFit.current = true
    }
  }, [map])
  return null
}

function FlyToSelected({ target }: { target: [number, number] | null }) {
  const map = useMap()
  // Only fly when the target coordinates actually change (a new selection, or the
  // selected engineer moved) — not on every render. Without this the 60s auto-refresh
  // re-runs the effect with a fresh array of the same coords and yanks the admin's
  // view back to the selected pin every minute.
  const lastKey = useRef<string | null>(null)
  useEffect(() => {
    if (!target) { lastKey.current = null; return }
    const key = `${target[0]},${target[1]}`
    if (key === lastKey.current) return
    lastKey.current = key
    // Center exactly on the pin at street zoom. The marker's popup opens on selection
    // (see the openPopup effect below) and Leaflet auto-pans it into view, so there's
    // no need to manually offset the centre (an earlier attempt at that landed the map
    // off the pin entirely).
    map.flyTo(target, Math.max(map.getZoom(), 15), { duration: 0.6 })
  }, [map, target])
  return null
}

interface Props {
  engineers: FieldEngineerOverview[]
  selectedId: string | null
}

export default function LeafletMap({ engineers, selectedId }: Props) {
  const rawPoints = engineers.flatMap(e => {
    const ls = e.lastSeen
    if (!ls || ls.lat == null || ls.lng == null) return []
    return [{ engineer: e, lat: ls.lat, lng: ls.lng, at: ls.at, placeName: ls.placeName, previousSeen: e.previousSeen }]
  })
  const points = jitterOverlapping(rawPoints)
  const selected = points.find(p => p.engineer.id === selectedId)

  const markerRefs = useRef<Record<string, L.Marker | null>>({})
  useEffect(() => {
    if (!selectedId) return
    // Open the popup just after the flyTo animation settles, so its auto-pan lands on
    // the already-centred pin instead of fighting the in-flight camera move.
    const t = setTimeout(() => markerRefs.current[selectedId]?.openPopup(), 700)
    return () => clearTimeout(t)
  }, [selectedId])

  return (
    <MapContainer center={INDIA_CENTER} zoom={5} style={{ width: '100%', height: '100%' }}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitIndia />
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
                {p.previousSeen && (
                  <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid #F1E7EB' }}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: '#9CA3AF' }}>Previous location</div>
                    <div style={{ fontSize: 11, color: '#7A6870', marginTop: 2 }}>{p.previousSeen.placeName || 'Location unavailable'}</div>
                    <div style={{ fontSize: 10, color: '#9CA3AF', marginTop: 1 }}>{formatRelativeTime(p.previousSeen.at)}</div>
                  </div>
                )}
                <Link href={`/engineers/${p.engineer.id}`} style={{ display: 'inline-block', marginTop: 8, fontSize: 11, color: '#7D1D3F', fontWeight: 500 }}>
                  View profile →
                </Link>
              </div>
            </Popup>
          </Marker>
        )
      })}
    </MapContainer>
  )
}
