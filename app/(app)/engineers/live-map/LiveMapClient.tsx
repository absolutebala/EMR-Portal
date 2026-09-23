'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import Topbar from '@/components/layout/Topbar'
import type { FieldEngineerOverview } from '@/app/actions/get-engineers'

// Leaflet touches window/document at import time, so it can't run during SSR/prerender
// — this is the first place in the app that needs a client-only dynamic import.
const LeafletMap = dynamic(() => import('./LeafletMap'), {
  ssr: false,
  loading: () => (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--txm)', fontSize: 13 }}>
      Loading map…
    </div>
  ),
})

const REFRESH_MS = 60_000

// "Nearby" radius for the location search — available engineers within this many km of
// the searched place are listed and the map is framed to fit them.
const NEARBY_RADIUS_KM = 150

// Great-circle distance in km between two lat/lng points.
function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const R = 6371
  const dLat = toRad(bLat - aLat)
  const dLng = toRad(bLng - aLng)
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}

// Geocode a free-text place (city/area/state) to coordinates via OpenStreetMap's
// Nominatim — biased to India, one best match. `stateName` is set only when the match is
// a whole state/region (addresstype 'state'): a radius from a state's centroid misses most
// of it, so callers list every engineer whose last-seen state matches instead.
async function geocodePlace(query: string): Promise<{ lat: number; lng: number; label: string; stateName: string | null } | null> {
  const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=1&countrycodes=in&q=${encodeURIComponent(query)}`, {
    headers: { 'Accept-Language': 'en' },
  })
  if (!res.ok) return null
  const data = (await res.json()) as { lat: string; lon: string; display_name: string; addresstype?: string; address?: { state?: string } }[]
  if (!data.length) return null
  const m = data[0]
  const isState = m.addresstype === 'state'
  const stateName = isState ? (m.address?.state || m.display_name.split(',')[0].trim()) : null
  return { lat: parseFloat(m.lat), lng: parseFloat(m.lon), label: m.display_name, stateName }
}

// Engineers we consider "reachable" for a location search: anyone who isn't explicitly
// Unavailable or On Leave (Available, plus on-job states like On the way / Reached / Site
// Visit / HQ). Excludes only the two "can't take work" statuses.
function isReachable(status: string): boolean {
  return status !== 'unavailable' && status !== 'on_leave'
}

// Same small status config duplicated per-page elsewhere in this app (dashboard/page.tsx,
// EngineersPageClient.tsx) — kept local rather than shared, matching that convention.
const STATUS_CFG: Record<string, { bg: string; color: string; label: string }> = {
  available: { bg: '#D1FAE5', color: '#065F46', label: 'Available' },
  unavailable: { bg: '#F3F4F6', color: '#6B7280', label: 'Unavailable' },
  on_leave: { bg: '#F1F5F9', color: '#475569', label: 'On Leave' },
  on_the_way: { bg: '#DBEAFE', color: '#1D4ED8', label: 'On the way' },
  travelling: { bg: '#EDE9FE', color: '#5B21B6', label: 'Travelling' },
  reached: { bg: '#FEF3C7', color: '#92400E', label: 'Reached project' },
  completed: { bg: '#D1FAE5', color: '#065F46', label: 'Completed' },
  // Today's punch-in category (shown when there's no active job workflow).
  hq: { bg: '#FBEDE2', color: '#9A5B2E', label: 'HQ' },
  business_dev: { bg: '#E1E6F5', color: '#1E2A6B', label: 'Business Development' },
  travel: { bg: '#FBE3F1', color: '#9D174D', label: 'Travel' },
  site_visit: { bg: '#DCFCE7', color: '#166534', label: 'Site Visit' },
  others: { bg: '#F6F6F7', color: '#4B5563', label: 'Others' },
}

const UNKNOWN_LOCATION = 'Unknown location'

// extractPlaceLabel (lib/geocode.ts) builds placeName as "locality, city, state"
// when a state is available from the reverse-geocode response — the last segment
// is the state in the common case. No separate state field is stored anywhere, so
// this is derived client-side from the same string already shown as "last seen".
function deriveState(placeName: string | null): string {
  if (!placeName) return UNKNOWN_LOCATION
  const parts = placeName.split(',').map(p => p.trim()).filter(Boolean)
  if (parts.length < 2) return UNKNOWN_LOCATION
  return parts[parts.length - 1]
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

function formatScheduledDate(dateStr: string | null): string {
  if (!dateStr) return 'Not scheduled'
  return new Date(dateStr).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

// The prefix each assigned-notification line leads with: "Past due" for anything before
// today, "Today"/"Tomorrow" for the next two days, else the formatted date. `urgent`
// (past due or today) drives the red highlight.
function scheduledDayPrefix(dateStr: string | null): { label: string; urgent: boolean } {
  if (!dateStr) return { label: 'Not scheduled', urgent: false }
  const todayStr = new Date().toLocaleDateString('en-CA')
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1)
  const tomorrowStr = tomorrow.toLocaleDateString('en-CA')
  if (dateStr < todayStr) return { label: `Past due · ${formatScheduledDate(dateStr)}`, urgent: true }
  if (dateStr === todayStr) return { label: 'Today', urgent: true }
  if (dateStr === tomorrowStr) return { label: 'Tomorrow', urgent: false }
  return { label: formatScheduledDate(dateStr), urgent: false }
}

interface Props {
  engineers: FieldEngineerOverview[]
  error: string | null
  userName: string
  userRole: string
}

export default function LiveMapClient({ engineers, error, userName, userRole }: Props) {
  const router = useRouter()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  // Location search: geocode a place, then list/frame available engineers near it.
  const [locQuery, setLocQuery] = useState('')
  const [geoLoading, setGeoLoading] = useState(false)
  const [geoError, setGeoError] = useState('')
  const [searchedLocation, setSearchedLocation] = useState<{ lat: number; lng: number; label: string; stateName: string | null } | null>(null)

  async function handleLocationSearch() {
    const q = locQuery.trim()
    if (!q) return
    setGeoLoading(true); setGeoError('')
    try {
      const loc = await geocodePlace(q)
      if (!loc) { setGeoError('No place found for that search.'); setSearchedLocation(null) }
      else { setSearchedLocation(loc); setSelectedId(null) }
    } catch {
      setGeoError('Location search failed. Check your connection and try again.')
    } finally {
      setGeoLoading(false)
    }
  }

  function clearLocationSearch() {
    setSearchedLocation(null); setLocQuery(''); setGeoError('')
  }

  // Reachable engineers for the searched location, shown in the sidebar and used to frame
  // the map. Two modes:
  //  • state search → everyone whose last-seen state matches (a radius from a state
  //    centroid would miss most of it); distance is shown when a fresh position exists.
  //  • city/area search → reachable engineers with a fresh (mapped) position within the
  //    radius, nearest first.
  const nearbyAvailable = useMemo(() => {
    if (!searchedLocation) return []
    const reachable = engineers.filter(e => isReachable(e.status))
    const distTo = (e: FieldEngineerOverview) =>
      e.lastSeen?.fresh && e.lastSeen.lat != null && e.lastSeen.lng != null
        ? haversineKm(searchedLocation.lat, searchedLocation.lng, e.lastSeen.lat, e.lastSeen.lng)
        : null
    if (searchedLocation.stateName) {
      const target = searchedLocation.stateName.toLowerCase()
      return reachable
        .filter(e => deriveState(e.lastSeen?.placeName ?? null).toLowerCase() === target)
        .map(e => ({ engineer: e, distanceKm: distTo(e) }))
        .sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity) || a.engineer.name.localeCompare(b.engineer.name))
    }
    return reachable
      .map(e => ({ engineer: e, distanceKm: distTo(e) }))
      .filter((x): x is { engineer: FieldEngineerOverview; distanceKm: number } => x.distanceKm != null && x.distanceKm <= NEARBY_RADIUS_KM)
      .sort((a, b) => a.distanceKm - b.distanceKm)
  }, [engineers, searchedLocation])

  // "Live" here means "refreshes on its own" — the underlying data is each engineer's
  // last-known position (updated passively when their app is open), not a continuous
  // real-time feed, so a periodic full-page refresh is enough rather than a
  // websocket/polling API.
  useEffect(() => {
    const id = setInterval(() => router.refresh(), REFRESH_MS)
    return () => clearInterval(id)
  }, [router])

  const filteredEngineers = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return engineers
    return engineers.filter(e => e.name.toLowerCase().includes(q))
  }, [engineers, search])

  // Alphabetical by state name — geography has no natural priority order (unlike
  // status, which favored active/en-route engineers first) — with engineers whose
  // location can't be resolved to a state grouped last.
  const groupedByState = useMemo(() => {
    const groups = new Map<string, FieldEngineerOverview[]>()
    for (const e of filteredEngineers) {
      const state = deriveState(e.lastSeen?.placeName ?? null)
      const list = groups.get(state)
      if (list) list.push(e)
      else groups.set(state, [e])
    }
    return [...groups.entries()].sort(([a], [b]) => {
      if (a === UNKNOWN_LOCATION) return 1
      if (b === UNKNOWN_LOCATION) return -1
      return a.localeCompare(b)
    })
  }, [filteredEngineers])

  return (
    // A definite 100dvh shell so heights propagate down through the flex chain — the
    // (app) layout column is only minHeight:100vh (a minimum, not a cap), which left
    // flex:1 children free to grow to their content and broke the engineer list's
    // internal scroll. Pinning the shell to the viewport height fixes that.
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <Topbar title="Live Map" userName={userName} userRole={userRole} />
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: '22px 24px', overflow: 'hidden' }}>
        {error && (
          <div style={{ background: '#FEE2E2', color: '#DC2626', borderRadius: 8, padding: '10px 12px', fontSize: 12, marginBottom: 14, flexShrink: 0 }}>{error}</div>
        )}

        <div style={{ fontSize: 12, color: 'var(--txm)', marginBottom: 14, flexShrink: 0 }}>
          Last-known position per engineer — updates automatically. Not a continuous live feed; positions refresh whenever an engineer opens the app or checks in. Every field engineer is listed below regardless of status; a pin appears on the map only while a position is recent (within 24 hours) — older locations drop off the map but stay in the list.
        </div>

        {/* Map and engineer list are two separate boxes side by side (with a gap), each
            bounded to the row height so the list scrolls internally without stretching
            the map box to match. */}
        <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 16 }}>
          {/* Map box. position/zIndex establish a stacking context so Leaflet's internal
              high z-index panes & controls (up to ~1000) stay contained below this box —
              the sticky Topbar (z-index 50) and its notification dropdown then render on
              top of the map instead of being covered by it. */}
          <div style={{ position: 'relative', zIndex: 0, flex: 1, minWidth: 0, minHeight: 0, borderRadius: 10, border: '1px solid var(--gm)', overflow: 'hidden' }}>
            <LeafletMap engineers={engineers} selectedId={selectedId} searchedLocation={searchedLocation} radiusKm={NEARBY_RADIUS_KM} nearbyIds={nearbyAvailable.map(x => x.engineer.id)} />
          </div>

          {/* Field engineers box — separate card, internal scroll. */}
          <div style={{ width: 300, flexShrink: 0, minHeight: 0, borderRadius: 10, border: '1px solid var(--gm)', overflow: 'hidden', display: 'flex', flexDirection: 'column', background: '#fff' }}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--gm)', flexShrink: 0, background: '#FAFAFA' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--txm)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 8 }}>
                All field engineers ({filteredEngineers.length}{search ? ` of ${engineers.length}` : ''})
              </div>
              <input
                type="text"
                value={search}
                onChange={ev => setSearch(ev.target.value)}
                placeholder="Search engineer…"
                style={{ width: '100%', boxSizing: 'border-box', padding: '6px 10px', fontSize: 12, border: '1px solid var(--gm)', borderRadius: 6, outline: 'none' }}
              />
              {/* Location search: find available engineers near a city/place. */}
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <input
                  type="text"
                  value={locQuery}
                  onChange={ev => setLocQuery(ev.target.value)}
                  onKeyDown={ev => { if (ev.key === 'Enter') handleLocationSearch() }}
                  placeholder="Search location (city / area)…"
                  style={{ flex: 1, minWidth: 0, boxSizing: 'border-box', padding: '6px 10px', fontSize: 12, border: '1px solid var(--gm)', borderRadius: 6, outline: 'none' }}
                />
                <button
                  onClick={handleLocationSearch}
                  disabled={geoLoading || !locQuery.trim()}
                  style={{ padding: '6px 10px', fontSize: 11, fontWeight: 600, border: 'none', borderRadius: 6, background: 'var(--m)', color: '#fff', cursor: geoLoading || !locQuery.trim() ? 'default' : 'pointer', opacity: geoLoading || !locQuery.trim() ? 0.6 : 1, fontFamily: 'Poppins,sans-serif', flexShrink: 0 }}
                >
                  {geoLoading ? '…' : 'Go'}
                </button>
              </div>
              {geoError && <div style={{ fontSize: 10, color: '#DC2626', marginTop: 5 }}>{geoError}</div>}
              {searchedLocation && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 6 }}>
                  <span style={{ fontSize: 10, color: 'var(--txm)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={searchedLocation.label}>📍 {searchedLocation.label}</span>
                  <button onClick={clearLocationSearch} style={{ background: 'none', border: 'none', color: 'var(--m)', fontSize: 10, fontWeight: 600, cursor: 'pointer', flexShrink: 0, padding: 0 }}>Clear</button>
                </div>
              )}
            </div>
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
              {searchedLocation ? (
                <>
                  <div style={{ padding: '6px 14px', fontSize: 10, fontWeight: 600, color: 'var(--txm)', background: 'var(--gl)', textTransform: 'uppercase', letterSpacing: '.4px' }}>
                    {searchedLocation.stateName ? `In ${searchedLocation.stateName}` : `Within ${NEARBY_RADIUS_KM} km`} ({nearbyAvailable.length})
                  </div>
                  {nearbyAvailable.length === 0 ? (
                    <div style={{ padding: '14px', fontSize: 12, color: 'var(--txm)' }}>
                      {searchedLocation.stateName ? `No reachable engineers in ${searchedLocation.stateName}.` : `No reachable engineers within ${NEARBY_RADIUS_KM} km of this location.`}
                    </div>
                  ) : nearbyAvailable.map(({ engineer: e, distanceKm }) => {
                    const statusCfg = STATUS_CFG[e.status] || STATUS_CFG.available
                    return (
                    <div key={e.id} onClick={() => setSelectedId(e.id)} style={{ padding: '10px 14px', borderBottom: '1px solid var(--gl)', cursor: 'pointer', background: selectedId === e.id ? 'var(--mp)' : 'transparent' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--tx)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.name}</span>
                        {distanceKm != null
                          ? <span style={{ fontSize: 9, fontWeight: 600, background: '#D1FAE5', color: '#065F46', borderRadius: 20, padding: '2px 7px', flexShrink: 0 }}>{distanceKm < 1 ? '<1 km' : `${distanceKm.toFixed(distanceKm < 10 ? 1 : 0)} km`}</span>
                          : <span style={{ fontSize: 9, fontWeight: 600, background: statusCfg.bg, color: statusCfg.color, borderRadius: 20, padding: '2px 7px', flexShrink: 0 }}>{statusCfg.label}</span>}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--txm)', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.lastSeen?.placeName || 'Location unavailable'}</div>
                      <div style={{ fontSize: 10, color: 'var(--txm)', marginTop: 1 }}>{e.lastSeen ? `Last seen ${formatRelativeTime(e.lastSeen.at)}${!e.lastSeen.fresh ? ' · not on map' : ''}` : 'No location on file'}</div>
                    </div>
                    )
                  })}
                </>
              ) : (
                <>
              {groupedByState.map(([state, group]) => (
                <div key={state}>
                  <div style={{ padding: '6px 14px', fontSize: 10, fontWeight: 600, color: 'var(--txm)', background: 'var(--gl)', textTransform: 'uppercase', letterSpacing: '.4px' }}>
                    {state} ({group.length})
                  </div>
                  {group.map(e => {
                    const cfg = STATUS_CFG[e.status] || STATUS_CFG.available
                    const hasLocation = e.lastSeen?.lat != null && e.lastSeen?.lng != null
                    // Only fresh (<24h) positions are pinned on the map, so only those are
                    // clickable-to-focus. Stale-but-recorded locations still show their
                    // place + "last seen" text, they're just not tied to a pin.
                    const isPinned = hasLocation && !!e.lastSeen?.fresh
                    return (
                      <div
                        key={e.id}
                        onClick={() => isPinned && setSelectedId(e.id)}
                        style={{
                          padding: '10px 14px', borderBottom: '1px solid var(--gl)', cursor: isPinned ? 'pointer' : 'default',
                          background: selectedId === e.id ? 'var(--mp)' : 'transparent',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--tx)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.name}</span>
                          <span style={{ fontSize: 9, fontWeight: 600, background: cfg.bg, color: cfg.color, borderRadius: 20, padding: '2px 7px', flexShrink: 0 }}>{cfg.label}</span>
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--txm)', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {hasLocation ? (e.lastSeen!.placeName || 'Location unavailable') : 'No location on file yet'}
                        </div>
                        {hasLocation && (
                          <div style={{ fontSize: 10, color: isPinned ? 'var(--txm)' : '#B0483C', marginTop: 1 }}>
                            Last seen {formatRelativeTime(e.lastSeen!.at)}{!isPinned ? ' · not on map' : ''}
                          </div>
                        )}
                        {e.nextNotifications.length > 0 && (
                          // One blank line of separation, then every upcoming notification —
                          // each led with Today / Tomorrow / date, then WO# and customer.
                          <div style={{ marginTop: 10, borderTop: '1px solid var(--gl)', paddingTop: 6 }}>
                            <div style={{ fontSize: 9, fontWeight: 600, color: 'var(--txm)', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 3 }}>Assigned notifications</div>
                            {e.nextNotifications.map(n => {
                              const p = scheduledDayPrefix(n.scheduledDate)
                              return (
                                <div key={n.woNumber} style={{ fontSize: 10, color: 'var(--tx)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  <span style={{ fontWeight: 600, color: p.urgent ? '#B0483C' : 'var(--txm)' }}>{p.label}:</span>{' '}
                                  {n.woNumber}{n.customerName ? ` · ${n.customerName}` : ''}
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              ))}
              {filteredEngineers.length === 0 && (
                <div style={{ padding: '14px', fontSize: 12, color: 'var(--txm)' }}>No engineers match “{search}”.</div>
              )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
