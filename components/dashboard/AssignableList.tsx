'use client'

import { useState } from 'react'
import { getAssignableEngineers, type AssignableEngineer } from '@/app/actions/get-work-orders'
import { reassignWorkOrderEngineer } from '@/app/actions/create-work-order'
import { ListCard, ListRow } from './DashboardCards'
import type { DashboardWorkOrderBrief } from '@/app/actions/get-dashboard'

interface Props {
  title: string
  viewAllHref: string
  workOrders: DashboardWorkOrderBrief[]
  empty: string
}

const selectStyle: React.CSSProperties = {
  width: '100%', padding: '7px 9px', border: '1.5px solid var(--gm)', borderRadius: 7,
  fontSize: 11, color: 'var(--tx)', outline: 'none', fontFamily: 'Poppins,sans-serif', background: '#fff',
}

export default function AssignableList({ title, viewAllHref, workOrders, empty }: Props) {
  const [items, setItems] = useState(workOrders)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [engineers, setEngineers] = useState<AssignableEngineer[]>([])
  const [loadingEngineers, setLoadingEngineers] = useState(false)
  const [selectedEngineerId, setSelectedEngineerId] = useState('')
  const [scheduledDate, setScheduledDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function toggleExpand(wo: DashboardWorkOrderBrief) {
    if (expandedId === wo.id) { setExpandedId(null); return }
    setExpandedId(wo.id)
    setSelectedEngineerId('')
    setScheduledDate(new Date().toLocaleDateString('en-CA'))
    setError('')
    setLoadingEngineers(true)
    const { engineers: eng } = await getAssignableEngineers(wo.id)
    setEngineers(eng)
    setLoadingEngineers(false)
  }

  async function confirmAssign(woId: string) {
    if (!selectedEngineerId) { setError('Pick an engineer'); return }
    if (!scheduledDate) { setError('Pick a scheduled date'); return }
    setSaving(true)
    setError('')
    const { error: err } = await reassignWorkOrderEngineer(woId, selectedEngineerId, scheduledDate)
    setSaving(false)
    if (err) { setError(err); return }
    setItems(prev => prev.filter(w => w.id !== woId))
    setExpandedId(null)
  }

  return (
    <ListCard title={title} viewAllHref={viewAllHref} empty={empty}>
      {items.map(wo => (
        <div key={wo.id}>
          <ListRow title={wo.woNumber} subtitle={wo.customerName} onClick={() => toggleExpand(wo)}>
            <span style={{ fontSize: 10, color: 'var(--m)', fontWeight: 600 }}>
              {expandedId === wo.id ? 'Cancel' : 'Assign →'}
            </span>
          </ListRow>
          {expandedId === wo.id && (
            <div style={{ padding: '0 14px 12px', borderTop: 'none' }}>
              {loadingEngineers ? (
                <div style={{ fontSize: 11, color: 'var(--txm)', padding: '6px 0' }}>Loading engineers…</div>
              ) : engineers.length === 0 ? (
                <div style={{ fontSize: 11, color: 'var(--txm)', padding: '6px 0' }}>No field engineers available.</div>
              ) : (
                <>
                  <select value={selectedEngineerId} onChange={e => setSelectedEngineerId(e.target.value)} style={{ ...selectStyle, marginBottom: 6 }}>
                    <option value="">Select engineer…</option>
                    {engineers.map(e => (
                      <option key={e.id} value={e.id}>
                        {e.first_name} {e.last_name}{e.distanceKm != null ? ` — ${e.distanceKm.toFixed(1)} km` : ''}
                      </option>
                    ))}
                  </select>
                  <input
                    type="date"
                    value={scheduledDate}
                    onChange={e => setScheduledDate(e.target.value)}
                    min={new Date().toLocaleDateString('en-CA')}
                    style={{ ...selectStyle, marginBottom: 8 }}
                  />
                  {error && <div style={{ fontSize: 10, color: '#DC2626', marginBottom: 6 }}>{error}</div>}
                  <button
                    onClick={() => confirmAssign(wo.id)}
                    disabled={saving}
                    style={{
                      width: '100%', padding: '7px', borderRadius: 7, border: 'none',
                      background: saving ? '#C4B5A0' : 'var(--m)', color: '#fff', fontSize: 11, fontWeight: 600,
                      cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'Poppins,sans-serif',
                    }}
                  >
                    {saving ? 'Assigning…' : 'Confirm assignment'}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      ))}
    </ListCard>
  )
}
