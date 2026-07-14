'use client'

import { useMemo, useState } from 'react'
import MobileHeader from '@/components/mobile/MobileHeader'
import BottomNav from '@/components/mobile/BottomNav'
import JobCard from '@/components/mobile/JobCard'
import type { MobileWorkOrder } from '@/app/actions/mobile-actions'

interface Props {
  workOrders: MobileWorkOrder[]
  error: string | null
}

type TabId = 'all' | 'assigned' | 'in_progress' | 'pending' | 'completed'

const TABS: { id: TabId; label: string; statuses: string[] }[] = [
  { id: 'all', label: 'All', statuses: [] },
  { id: 'assigned', label: 'Assigned', statuses: ['assigned', 'unassigned'] },
  { id: 'in_progress', label: 'In Progress', statuses: ['in_progress'] },
  { id: 'pending', label: 'Pending', statuses: ['pending', 'needs_reassignment'] },
  { id: 'completed', label: 'Completed', statuses: ['completed'] },
]

export default function JobsListClient({ workOrders, error }: Props) {
  const [tab, setTab] = useState<TabId>('all')
  const [search, setSearch] = useState('')

  const tabCounts = useMemo(() => {
    const counts: Record<TabId, number> = { all: workOrders.length, assigned: 0, in_progress: 0, pending: 0, completed: 0 }
    for (const t of TABS) {
      if (t.id === 'all') continue
      counts[t.id] = workOrders.filter(w => t.statuses.includes(w.status)).length
    }
    return counts
  }, [workOrders])

  const filtered = useMemo(() => {
    const activeTab = TABS.find(t => t.id === tab)!
    let list = activeTab.statuses.length ? workOrders.filter(w => activeTab.statuses.includes(w.status)) : workOrders
    const q = search.trim().toLowerCase()
    if (q) {
      list = list.filter(w =>
        w.wo_number.toLowerCase().includes(q) ||
        w.customer_name.toLowerCase().includes(q) ||
        (w.site_name || '').toLowerCase().includes(q) ||
        w.serial_numbers.some(sn => sn.toLowerCase().includes(q))
      )
    }
    return list
  }, [workOrders, tab, search])

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', background: '#F8F5F6' }}>
      <MobileHeader title="My Jobs" backHref="/mobile/dashboard" />

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
        {error && (
          <div style={{ background: '#FEE2E2', color: '#DC2626', borderRadius: 10, padding: '12px 14px', fontSize: 13, marginBottom: 16 }}>
            {error}
          </div>
        )}

        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, background: '#fff',
          border: '1.5px solid #E5E0E3', borderRadius: 11, padding: '9px 12px', marginBottom: 12,
        }}>
          <svg width="14" height="14" fill="none" stroke="#94A3B8" strokeWidth="2" viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by job ID, customer, serial..."
            style={{ border: 'none', outline: 'none', fontSize: 12, color: '#1C0D14', background: 'transparent', flex: 1, fontFamily: 'Poppins, sans-serif' }}
          />
        </div>

        <div style={{
          display: 'flex', gap: 3, background: 'rgba(0,0,0,0.04)', borderRadius: 10, padding: 3,
          marginBottom: 14, overflowX: 'auto',
        }}>
          {TABS.map(t => (
            <button
              key={t.id}
              className="mtap"
              onClick={() => setTab(t.id)}
              style={{
                flexShrink: 0, padding: '6px 11px', borderRadius: 7, fontSize: 11, fontWeight: 500,
                cursor: 'pointer', whiteSpace: 'nowrap', border: 'none', fontFamily: 'Poppins, sans-serif',
                background: tab === t.id ? '#fff' : 'transparent',
                color: tab === t.id ? '#7D1D3F' : '#7A6870',
                boxShadow: tab === t.id ? '0 1px 3px rgba(125,29,63,0.1)' : 'none',
              }}
            >
              {t.label} ({tabCounts[t.id]})
            </button>
          ))}
        </div>

        {filtered.length === 0 && !error && (
          <div style={{ background: '#fff', borderRadius: 16, padding: '32px 24px', textAlign: 'center', border: '1px solid #E5E0E3' }}>
            <div style={{ fontSize: 12, color: '#7A6870' }}>No jobs match this filter.</div>
          </div>
        )}

        {filtered.map(wo => <JobCard key={wo.id} wo={wo} />)}
      </div>

      <BottomNav active="jobs" />
    </div>
  )
}
