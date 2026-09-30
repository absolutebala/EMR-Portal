'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import L from 'leaflet'
import { MapContainer, TileLayer, Marker, Popup, Tooltip, Circle, useMap } from 'react-leaflet'
import type { LatLngBoundsExpression, LatLngExpression } from 'leaflet'
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
    <div style="width:16px;height:16px;border-radius:50% 50% 50% 0;background:#7D1D3F;transform:rotate(-45deg);border:1.5px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;">
      <div style="transform:rotate(45deg);display:flex;">
        <svg viewBox="0 0 24 24" width="8" height="8" fill="#fff"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4.4 3.6-8 8-8s8 3.6 8 8"/></svg>
      </div>
    </div>
  `,
  iconSize: [16, 16],
  iconAnchor: [8, 16],
  popupAnchor: [0, -14],
})

// A blue teardrop for the searched location, visually distinct from the maroon engineer
// pins so the admin can tell the place-of-interest apart from the technicians.
const SEARCH_LOCATION_ICON = L.divIcon({
  className: 'search-location-marker',
  html: `
    <div style="width:30px;height:30px;border-radius:50% 50% 50% 0;background:#2563EB;transform:rotate(-45deg);border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;">
      <div style="transform:rotate(45deg);display:flex;">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="#fff"><path d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5z"/></svg>
      </div>
    </div>
  `,
  iconSize: [30, 30],
  iconAnchor: [15, 30],
  popupAnchor: [0, -28],
})

// A round maroon badge showing the number of engineers grouped at (or near) a spot.
function countIcon(n: number): L.DivIcon {
  const size = n >= 100 ? 34 : n >= 10 ? 30 : 26
  return L.divIcon({
    className: 'technician-cluster',
    html: `
      <div style="width:${size}px;height:${size}px;border-radius:50%;background:#7D1D3F;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;color:#fff;font-size:12px;font-weight:700;font-family:Poppins,sans-serif;">${n}</div>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  })
}

const INDIA_CENTER: [number, number] = [22.9734, 78.6569]
// Mainland India bounding box (SW → NE), used to frame the whole country on first
// load so the admin sees how engineers are spread out nationally rather than being
// zoomed straight into wherever the pins happen to cluster.
const INDIA_BOUNDS: LatLngBoundsExpression = [[6.5, 68.0], [35.7, 97.5]]

type MapPoint = {
  engineer: FieldEngineerOverview
  lat: number
  lng: number
  at: string
  placeName: string | null
  previousSeen: FieldEngineerOverview['previousSeen']
}

// Group pins that sit within ~CLUSTER_PX pixels of each other *at the current zoom*, so
// engineers who visually overlap on the map (e.g. everyone around Chennai when zoomed
// out to all of India) collapse onto one count pin — and separate back into individual
// pins as the admin zooms in. This is screen-distance based (not a fixed geographic
// grid) so it stays right at every zoom level.
const CLUSTER_PX = 34
type Cluster = { lat: number; lng: number; group: MapPoint[]; anchor: L.Point }
function clusterByPixels(map: L.Map, points: MapPoint[]): Cluster[] {
  const out: Cluster[] = []
  for (const p of points) {
    const pt = map.latLngToLayerPoint([p.lat, p.lng])
    let placed = false
    for (const c of out) {
      if (c.anchor.distanceTo(pt) <= CLUSTER_PX) { c.group.push(p); placed = true; break }
    }
    if (!placed) out.push({ lat: p.lat, lng: p.lng, group: [p], anchor: pt })
  }
  return out
}

// Frame the whole of India once on first load (the documented react-leaflet way is to
// reach into the map instance imperatively via useMap()). Fitting a fixed India box —
// rather than the marker bounds — means the admin always opens on the national view and
// can see how engineers are spread across the country, instead of being zoomed into
// wherever the pins happen to cluster. Runs only once, so the auto-refresh never
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
  // selected engineer moved) — not on every render. Without this the auto-refresh
  // re-runs the effect with a fresh array of the same coords and yanks the admin's
  // view back to the selected pin every minute.
  const lastKey = useRef<string | null>(null)
  useEffect(() => {
    if (!target) { lastKey.current = null; return }
    const key = `${target[0]},${target[1]}`
    if (key === lastKey.current) return
    lastKey.current = key
    // Center exactly on the pin at street zoom. At that zoom the pixel clustering splits
    // co-located engineers back into individual pins, so the selected one is on its own.
    map.flyTo(target, Math.max(map.getZoom(), 15), { duration: 0.6 })
  }, [map, target])
  return null
}

// Frame the map to a searched location: fit the searched point + the nearby available
// engineers so the admin sees them together; if none are nearby, just centre on the
// place at city zoom. Re-runs only when the search (or its result set) actually changes.
function FitToSearch({ location, points }: { location: { lat: number; lng: number } | null; points: [number, number][] }) {
  const map = useMap()
  const lastKey = useRef<string | null>(null)
  useEffect(() => {
    if (!location) { lastKey.current = null; return }
    const key = `${location.lat},${location.lng},${points.length}`
    if (key === lastKey.current) return
    lastKey.current = key
    if (points.length) {
      const all: LatLngExpression[] = [[location.lat, location.lng], ...points]
      map.fitBounds(L.latLngBounds(all), { padding: [50, 50], maxZoom: 13 })
    } else {
      map.flyTo([location.lat, location.lng], 11, { duration: 0.6 })
    }
  }, [map, location, points])
  return null
}

// The engineer markers themselves — kept in a child so it can read the live map instance
// (useMap) to project lat/lng to pixels and re-cluster whenever the admin zooms or pans.
function EngineerMarkers({ points, selectedId }: { points: MapPoint[]; selectedId: string | null }) {
  const map = useMap()
  const [, setTick] = useState(0)
  useEffect(() => {
    const onChange = () => setTick(t => t + 1)
    map.on('zoomend', onChange)
    map.on('moveend', onChange)
    return () => { map.off('zoomend', onChange); map.off('moveend', onChange) }
  }, [map])

  const clusters = clusterByPixels(map, points)
  const clustersRef = useRef(clusters)
  useEffect(() => { clustersRef.current = clusters })
  const markerRefs = useRef<(L.Marker | null)[]>([])

  // When an engineer is picked from the sidebar, open the popup of whichever pin now
  // holds them once the fly-to has settled (by then the clusters have re-computed at the
  // zoomed-in level, so it's typically their own pin).
  useEffect(() => {
    if (!selectedId) return
    const t = setTimeout(() => {
      const idx = clustersRef.current.findIndex(c => c.group.some(p => p.engineer.id === selectedId))
      if (idx >= 0) markerRefs.current[idx]?.openPopup()
    }, 750)
    return () => clearTimeout(t)
  }, [selectedId])

  return (
    <>
      {clusters.map((c, idx) => {
        // A single engineer at this spot — the usual teardrop pin.
        if (c.group.length === 1) {
          const p = c.group[0]
          const statusCfg = STATUS_CFG[p.engineer.status] || STATUS_CFG.available
          return (
            <Marker
              key={`s-${p.engineer.id}`}
              position={[p.lat, p.lng]}
              icon={TECHNICIAN_ICON}
              ref={el => { markerRefs.current[idx] = el }}
            >
              <Tooltip direction="top" offset={[0, -14]} opacity={0.95}>{p.engineer.name}</Tooltip>
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
        }

        // Several engineers overlap here — one count pin, expandable to the list.
        return (
          <Marker
            key={`c-${c.group.map(p => p.engineer.id).join('-')}`}
            position={[c.lat, c.lng]}
            icon={countIcon(c.group.length)}
            ref={el => { markerRefs.current[idx] = el }}
          >
            <Tooltip direction="top" offset={[0, -12]} opacity={0.95}>{c.group.length} engineers here</Tooltip>
            <Popup>
              <div style={{ fontFamily: 'Poppins, sans-serif', minWidth: 190 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#1C0D14', marginBottom: 6 }}>{c.group.length} engineers here</div>
                <div style={{ maxHeight: 220, overflowY: 'auto' }}>
                  {c.group.map((p, i) => {
                    const cfg = STATUS_CFG[p.engineer.status] || STATUS_CFG.available
                    return (
                      <div key={p.engineer.id} style={{ borderTop: i === 0 ? 'none' : '1px solid #F1E7EB', paddingTop: i === 0 ? 0 : 8, marginTop: i === 0 ? 0 : 8 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: '#1C0D14' }}>{p.engineer.name}</span>
                          <span style={{ fontSize: 9, fontWeight: 600, background: cfg.bg, color: cfg.color, borderRadius: 20, padding: '2px 7px', whiteSpace: 'nowrap' }}>{cfg.label}</span>
                        </div>
                        <div style={{ fontSize: 10, color: '#9CA3AF', marginTop: 1 }}>{p.placeName || 'Location unavailable'} · {formatRelativeTime(p.at)}</div>
                        <Link href={`/engineers/${p.engineer.id}`} style={{ display: 'inline-block', marginTop: 3, fontSize: 10, color: '#7D1D3F', fontWeight: 500 }}>
                          View profile →
                        </Link>
                      </div>
                    )
                  })}
                </div>
              </div>
            </Popup>
          </Marker>
        )
      })}
    </>
  )
}

interface Props {
  engineers: FieldEngineerOverview[]
  selectedId: string | null
  searchedLocation?: { lat: number; lng: number; label: string } | null
  radiusKm?: number
  nearbyIds?: string[]
}

export default function LeafletMap({ engineers, selectedId, searchedLocation, radiusKm = 150, nearbyIds = [] }: Props) {
  const rawPoints: MapPoint[] = engineers.flatMap(e => {
    const ls = e.lastSeen
    if (!ls || ls.lat == null || ls.lng == null) return []
    // A pin only reflects a genuinely recent position — `fresh` (computed server-side,
    // <24h) drops stale locations off the map. The engineer still shows in the sidebar
    // list with their "Last seen …" text, just isn't plotted.
    if (!ls.fresh) return []
    return [{ engineer: e, lat: ls.lat, lng: ls.lng, at: ls.at, placeName: ls.placeName, previousSeen: e.previousSeen }]
  })
  const selected = rawPoints.find(p => p.engineer.id === selectedId)

  const nearbySet = new Set(nearbyIds)
  const nearbyPoints = rawPoints.filter(p => nearbySet.has(p.engineer.id)).map(p => [p.lat, p.lng] as [number, number])

  // When a location is searched, plot ONLY the nearby-available engineers — the same set
  // shown in the sidebar list — so the map and the list stay consistent. With no active
  // search, show everyone as usual.
  const visiblePoints = searchedLocation ? rawPoints.filter(p => nearbySet.has(p.engineer.id)) : rawPoints

  return (
    <MapContainer center={INDIA_CENTER} zoom={5} style={{ width: '100%', height: '100%' }}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitIndia />
      <FlyToSelected target={selected ? [selected.lat, selected.lng] : null} />
      <FitToSearch location={searchedLocation ?? null} points={nearbyPoints} />
      {searchedLocation && (
        <>
          <Circle center={[searchedLocation.lat, searchedLocation.lng]} radius={radiusKm * 1000} pathOptions={{ color: '#2563EB', weight: 1, fillColor: '#2563EB', fillOpacity: 0.06 }} />
          <Marker position={[searchedLocation.lat, searchedLocation.lng]} icon={SEARCH_LOCATION_ICON}>
            <Popup>
              <div style={{ fontFamily: 'Poppins, sans-serif', minWidth: 160 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#1C0D14', marginBottom: 2 }}>Searched location</div>
                <div style={{ fontSize: 11, color: '#7A6870' }}>{searchedLocation.label}</div>
                <div style={{ fontSize: 10, color: '#9CA3AF', marginTop: 4 }}>Reachable engineers here: {nearbyIds.length}</div>
              </div>
            </Popup>
          </Marker>
        </>
      )}
      <EngineerMarkers points={visiblePoints} selectedId={selectedId} />
    </MapContainer>
  )
}
