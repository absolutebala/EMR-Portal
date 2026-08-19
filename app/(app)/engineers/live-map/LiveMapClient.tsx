'use client'

import { useEffect } from 'react'
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

interface Props {
  engineers: FieldEngineerOverview[]
  error: string | null
  userName: string
  userRole: string
}

export default function LiveMapClient({ engineers, error, userName, userRole }: Props) {
  const router = useRouter()

  // "Live" here means "refreshes on its own" — the underlying data is each engineer's
  // last-known position (updated passively when their app is open), not a continuous
  // real-time feed, so a periodic full-page refresh is enough rather than a
  // websocket/polling API.
  useEffect(() => {
    const id = setInterval(() => router.refresh(), REFRESH_MS)
    return () => clearInterval(id)
  }, [router])

  const withLocation = engineers.filter(e => e.lastSeen?.lat != null && e.lastSeen?.lng != null)
  const withoutLocation = engineers.length - withLocation.length

  return (
    <>
      <Topbar title="Live Map" userName={userName} userRole={userRole} />
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: '22px 24px' }}>
        {error && (
          <div style={{ background: '#FEE2E2', color: '#DC2626', borderRadius: 8, padding: '10px 12px', fontSize: 12, marginBottom: 14, flexShrink: 0 }}>{error}</div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexShrink: 0 }}>
          <div style={{ fontSize: 12, color: 'var(--txm)' }}>
            Last-known position per engineer — updates automatically. Not a continuous live feed; positions refresh whenever an engineer opens the app or checks in.
          </div>
          {withoutLocation > 0 && (
            <span style={{ fontSize: 11, color: 'var(--txm)', background: 'var(--gl)', borderRadius: 20, padding: '4px 10px', whiteSpace: 'nowrap', marginLeft: 12 }}>
              {withoutLocation} engineer{withoutLocation !== 1 ? 's' : ''} with no location yet
            </span>
          )}
        </div>

        <div style={{ flex: 1, minHeight: 400, borderRadius: 10, border: '1px solid var(--gm)', overflow: 'hidden', display: 'flex' }}>
          <LeafletMap engineers={withLocation} />
        </div>
      </div>
    </>
  )
}
