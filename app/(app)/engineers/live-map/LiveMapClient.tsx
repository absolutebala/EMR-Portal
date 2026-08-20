'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import Topbar from '@/components/layout/Topbar'
import type { FieldEngineerOverview, EngineerLocationPoint } from '@/app/actions/get-engineers'
import { getEngineerLocationHistory } from '@/app/actions/get-engineers'

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
  const [history, setHistory] = useState<EngineerLocationPoint[]>([])
  const [historyForId, setHistoryForId] = useState<string | null>(null)

  // "Live" here means "refreshes on its own" — the underlying data is each engineer's
  // last-known position (updated passively when their app is open), not a continuous
  // real-time feed, so a periodic full-page refresh is enough rather than a
  // websocket/polling API.
  useEffect(() => {
    const id = setInterval(() => router.refresh(), REFRESH_MS)
    return () => clearInterval(id)
  }, [router])

  // Fetch the selected engineer's earlier check-in locations on demand — not
  // prefetched for everyone, since the trail is only ever shown for one engineer
  // at a time.
  useEffect(() => {
    if (!selectedId) return
    let cancelled = false
    getEngineerLocationHistory(selectedId).then(({ points }) => {
      if (!cancelled) { setHistory(points); setHistoryForId(selectedId) }
    })
    return () => { cancelled = true }
  }, [selectedId])

  // Only trust `history` when it was actually fetched for the currently-selected
  // engineer — otherwise a stale previous engineer's trail would flash briefly
  // while the new fetch is in flight, or linger after deselecting.
  const displayedHistory = selectedId && historyForId === selectedId ? history : []

  const filteredEngineers = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return engineers
    return engineers.filter(e => e.name.toLowerCase().includes(q))
  }, [engineers, search])

  return (
    <>
      <Topbar title="Live Map" userName={userName} userRole={userRole} />
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: '22px 24px' }}>
        {error && (
          <div style={{ background: '#FEE2E2', color: '#DC2626', borderRadius: 8, padding: '10px 12px', fontSize: 12, marginBottom: 14, flexShrink: 0 }}>{error}</div>
        )}

        <div style={{ fontSize: 12, color: 'var(--txm)', marginBottom: 14, flexShrink: 0 }}>
          Last-known position per engineer — updates automatically. Not a continuous live feed; positions refresh whenever an engineer opens the app or checks in. Every field engineer is listed below regardless of status; only those with a recorded location can be pinned on the map.
        </div>

        <div style={{ flex: 1, minHeight: 400, borderRadius: 10, border: '1px solid var(--gm)', overflow: 'hidden', display: 'flex' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <LeafletMap engineers={engineers} selectedId={selectedId} history={displayedHistory} />
          </div>

          <div style={{ width: 280, flexShrink: 0, borderLeft: '1px solid var(--gm)', display: 'flex', flexDirection: 'column', background: '#fff' }}>
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
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {filteredEngineers.map(e => {
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
                  </div>
                )
              })}
              {filteredEngineers.length === 0 && (
                <div style={{ padding: '14px', fontSize: 12, color: 'var(--txm)' }}>No engineers match “{search}”.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
