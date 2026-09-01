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
          Last-known position per engineer — updates automatically. Not a continuous live feed; positions refresh whenever an engineer opens the app or checks in. Every field engineer is listed below regardless of status; only those with a recorded location can be pinned on the map.
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
            <LeafletMap engineers={engineers} selectedId={selectedId} />
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
            </div>
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
              {groupedByState.map(([state, group]) => (
                <div key={state}>
                  <div style={{ padding: '6px 14px', fontSize: 10, fontWeight: 600, color: 'var(--txm)', background: 'var(--gl)', textTransform: 'uppercase', letterSpacing: '.4px' }}>
                    {state} ({group.length})
                  </div>
                  {group.map(e => {
                    const cfg = STATUS_CFG[e.status] || STATUS_CFG.available
                    const hasLocation = e.lastSeen?.lat != null && e.lastSeen?.lng != null
                    return (
                      <div
                        key={e.id}
                        onClick={() => hasLocation && setSelectedId(e.id)}
                        style={{
                          padding: '10px 14px', borderBottom: '1px solid var(--gl)', cursor: hasLocation ? 'pointer' : 'default',
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
                          <div style={{ fontSize: 10, color: 'var(--txm)', marginTop: 1 }}>
                            Last seen {formatRelativeTime(e.lastSeen!.at)}
                          </div>
                        )}
                        {e.nextAssigned && (
                          <div style={{ fontSize: 10, color: 'var(--txm)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            Next: {e.nextAssigned.customerName || 'Notification'} — {formatScheduledDate(e.nextAssigned.scheduledDate)}
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
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
