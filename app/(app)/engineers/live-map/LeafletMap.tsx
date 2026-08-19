'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet'
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

// Staleness of the last-known *position*, independent of the engineer's own status.
function stalenessColor(at: string): string {
  const ageMs = Date.now() - new Date(at).getTime()
  if (ageMs <= 30 * 60_000) return '#059669' // seen in the last 30 min
  if (ageMs <= 4 * 3_600_000) return '#D97706' // seen in the last 4h
  return '#6B7280' // stale
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

const INDIA_CENTER: [number, number] = [22.9734, 78.6569]

// Leaflet has no declarative "fit to markers" prop — this reaches into the map
// instance imperatively via useMap(), the documented way to do it with react-leaflet.
function FitBounds({ bounds }: { bounds: LatLngBoundsExpression | null }) {
  const map = useMap()
  useEffect(() => {
    if (bounds) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 12 })
  }, [map, bounds])
  return null
}

interface Props {
  engineers: FieldEngineerOverview[]
}

export default function LeafletMap({ engineers }: Props) {
  const points = engineers.flatMap(e => {
    const ls = e.lastSeen
    if (!ls || ls.lat == null || ls.lng == null) return []
    return [{ engineer: e, lat: ls.lat, lng: ls.lng, at: ls.at, placeName: ls.placeName }]
  })
  const bounds: LatLngBoundsExpression | null = points.length ? points.map(p => [p.lat, p.lng] as [number, number]) : null

  return (
    <MapContainer center={INDIA_CENTER} zoom={5} style={{ width: '100%', height: '100%' }}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitBounds bounds={bounds} />
      {points.map(p => {
        const statusCfg = STATUS_CFG[p.engineer.status] || STATUS_CFG.available
        return (
          <CircleMarker
            key={p.engineer.id}
            center={[p.lat, p.lng]}
            radius={9}
            pathOptions={{ color: '#fff', weight: 2, fillColor: stalenessColor(p.at), fillOpacity: 1 }}
          >
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
          </CircleMarker>
        )
      })}
    </MapContainer>
  )
}
