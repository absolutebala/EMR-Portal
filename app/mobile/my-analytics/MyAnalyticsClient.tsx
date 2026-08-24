'use client'

import { useState } from 'react'
import MobileHeader from '@/components/mobile/MobileHeader'
import BottomNav from '@/components/mobile/BottomNav'
import { getMyAnalyticsSummary, getMyAnalyticsDrilldown } from '@/app/actions/my-analytics'
import type { EngineerAnalyticsSummary, AnalyticsMetric, AnalyticsDrilldownRow } from '@/lib/mobile/core/analytics'

interface Props {
  initialMonth: string
  initialSummary: EngineerAnalyticsSummary
  initialError: string | null
}

const METRICS: { key: AnalyticsMetric; label: string }[] = [
  { key: 'assigned', label: 'Assigned' },
  { key: 'resolved', label: 'Resolved' },
  { key: 'reassigned', label: 'Reassigned' },
  { key: 'expenses', label: 'Expenses' },
  { key: 'present', label: 'Attendance' },
  { key: 'leave', label: 'Leave' },
]

function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

function fmtDate(d: string | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function metricValue(summary: EngineerAnalyticsSummary, key: AnalyticsMetric): string {
  switch (key) {
    case 'assigned': return String(summary.assigned)
    case 'resolved': return String(summary.resolved)
    case 'reassigned': return String(summary.reassigned)
    case 'expenses': return `₹${summary.expenseTotal.toLocaleString('en-IN')}`
    case 'present': return String(summary.present)
    case 'leave': return String(summary.leave)
  }
}

export default function MyAnalyticsClient({ initialMonth, initialSummary, initialError }: Props) {
  const [month, setMonth] = useState(initialMonth)
  const [summary, setSummary] = useState(initialSummary)
  const [error, setError] = useState(initialError)
  const [loading, setLoading] = useState(false)

  const [expanded, setExpanded] = useState<AnalyticsMetric | null>(null)
  const [drilldownRows, setDrilldownRows] = useState<AnalyticsDrilldownRow[]>([])
  const [drilldownLoading, setDrilldownLoading] = useState(false)

  async function loadMonth(newMonth: string) {
    setMonth(newMonth)
    setExpanded(null)
    setLoading(true)
    const { summary: s, error: err } = await getMyAnalyticsSummary(newMonth)
    setSummary(s)
    setError(err)
    setLoading(false)
  }

  async function toggleMetric(key: AnalyticsMetric) {
    if (expanded === key) { setExpanded(null); return }
    setExpanded(key)
    setDrilldownLoading(true)
    const { rows } = await getMyAnalyticsDrilldown(month, key)
    setDrilldownRows(rows)
    setDrilldownLoading(false)
  }

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', background: '#F8F5F6' }}>
      <MobileHeader title="My Analytics" backHref="/mobile/dashboard" />

      <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
        <input
          type="month"
          value={month}
          onChange={e => e.target.value && loadMonth(e.target.value)}
          style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #E5E0E3', borderRadius: 10, fontSize: 13, outline: 'none', fontFamily: 'Poppins, sans-serif', marginBottom: 6, boxSizing: 'border-box' }}
        />
        <div style={{ fontSize: 11, color: '#7A6870', marginBottom: 16 }}>{monthLabel(month)}</div>

        {error && (
          <div style={{ background: '#FEE2E2', color: '#DC2626', borderRadius: 10, padding: '10px 12px', fontSize: 12, marginBottom: 16 }}>{error}</div>
        )}

        {loading ? (
          <div style={{ fontSize: 12, color: '#7A6870', textAlign: 'center', padding: 24 }}>Loading…</div>
        ) : (
          METRICS.map(m => {
            const isOpen = expanded === m.key
            return (
              <div key={m.key} style={{ background: '#fff', borderRadius: 12, marginBottom: 9, overflow: 'hidden' }}>
                <button
                  className="mtap"
                  onClick={() => toggleMetric(m.key)}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                >
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#1C0D14' }}>{m.label}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 16, fontWeight: 700, color: '#7D1D3F' }}>{metricValue(summary, m.key)}</span>
                    <span style={{ fontSize: 11, color: '#9CA3AF', transform: isOpen ? 'rotate(90deg)' : 'none' }}>›</span>
                  </span>
                </button>

                {isOpen && (
                  <div style={{ borderTop: '1px solid #F5F3F5', padding: '10px 16px 14px' }}>
                    {drilldownLoading ? (
                      <div style={{ fontSize: 12, color: '#7A6870' }}>Loading…</div>
                    ) : drilldownRows.length === 0 ? (
                      <div style={{ fontSize: 12, color: '#7A6870' }}>No records for this month.</div>
                    ) : (
                      drilldownRows.map(row => (
                        <div key={row.id} style={{ padding: '8px 0', borderBottom: '1px solid #F5F3F5', fontSize: 12 }}>
                          {(m.key === 'assigned' || m.key === 'resolved' || m.key === 'reassigned') && (
                            <>
                              <div style={{ fontWeight: 600, color: '#1C0D14' }}>{row.woNumber || '—'}</div>
                              <div style={{ color: '#7A6870' }}>{row.customerName || '—'} · {row.status || '—'} · {fmtDate(row.date)}</div>
                            </>
                          )}
                          {m.key === 'expenses' && (
                            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#1C0D14' }}>
                              <span>{row.woNumber || '—'} · {row.status || '—'} · {fmtDate(row.date)}</span>
                              <span style={{ fontWeight: 600 }}>₹{(row.amount ?? 0).toLocaleString('en-IN')}</span>
                            </div>
                          )}
                          {(m.key === 'present' || m.key === 'leave') && (
                            <div style={{ color: '#1C0D14' }}>{fmtDate(row.date)}</div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
      <BottomNav />
    </div>
  )
}
