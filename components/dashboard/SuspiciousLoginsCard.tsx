'use client'

import { useState } from 'react'
import Modal from '@/components/ui/Modal'
import { ListCard, ListRow, Badge } from '@/components/dashboard/DashboardCards'
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
export default function SuspiciousLoginsCard({ flags }: { flags: SuspiciousLoginFlag[] }) {
  const [selected, setSelected] = useState<SuspiciousLoginFlag | null>(null)

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
            <div style={{ fontSize: 12, color: 'var(--txm)', marginBottom: 16 }}>{selected.detail}</div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {selected.devices.map((d, i) => {
                const loc = d.lastPlaceName
                  || (d.lastLatitude != null && d.lastLongitude != null ? `${d.lastLatitude.toFixed(4)}, ${d.lastLongitude.toFixed(4)}` : null)
                const mapHref = d.lastLatitude != null && d.lastLongitude != null
                  ? `https://www.google.com/maps?q=${d.lastLatitude},${d.lastLongitude}` : null
                return (
                  <div key={d.deviceId || i} style={{ border: '1px solid var(--gm)', borderRadius: 10, padding: '12px 14px', background: '#FAFAFA' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--tx)' }}>{d.deviceName || 'Unknown device'}</span>
                      <span style={{ fontSize: 10, color: 'var(--txm)' }}>{d.loginCount} login{d.loginCount !== 1 ? 's' : ''}</span>
                    </div>
                    <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, color: 'var(--txm)' }}>
                      <div>
                        <span style={{ fontWeight: 600, color: 'var(--tx)' }}>Location: </span>
                        {loc ? (mapHref ? <a href={mapHref} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--m)', textDecoration: 'none' }}>{loc} ↗</a> : loc) : 'No location captured'}
                      </div>
                      <div>
                        <span style={{ fontWeight: 600, color: 'var(--tx)' }}>Last seen: </span>
                        {formatTime(d.lastSeen)}
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
