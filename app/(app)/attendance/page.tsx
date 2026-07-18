'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import Topbar from '@/components/layout/Topbar'
import { getAttendanceGrid, type AttendanceEngineer, type AttendanceCells } from '@/app/actions/get-attendance'

const STATUS_CFG: Record<string, { bg: string; color: string; label: string }> = {
  unassigned: { bg: '#F3F4F6', color: '#6B7280', label: 'Unassigned' },
  assigned: { bg: '#DBEAFE', color: '#1D4ED8', label: 'Assigned' },
  in_progress: { bg: '#FEF3C7', color: '#D97706', label: 'In Progress' },
  pending: { bg: '#FEE2E2', color: '#DC2626', label: 'Pending' },
  completed: { bg: '#D1FAE5', color: '#065F46', label: 'Completed' },
  needs_reassignment: { bg: '#FED7AA', color: '#9A3412', label: 'Need Reassign' },
  not_started: { bg: '#F3F4F6', color: '#6B7280', label: 'Not Started' },
}

type ViewMode = 'week' | 'month' | 'custom'

function toDateStr(d: Date): string {
  return d.toLocaleDateString('en-CA')
}

function formatColumnDate(dateStr: string): { weekday: string; dayMonth: string } {
  const d = new Date(`${dateStr}T00:00:00`)
  return {
    weekday: d.toLocaleDateString('en-IN', { weekday: 'short' }),
    dayMonth: d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
  }
}

function getRange(mode: ViewMode, anchor: Date, customFrom: string, customTo: string): { from: string; to: string; label: string } {
  if (mode === 'week') {
    const dow = anchor.getDay()
    const start = new Date(anchor); start.setDate(anchor.getDate() - dow)
    const end = new Date(start); end.setDate(start.getDate() + 6)
    return {
      from: toDateStr(start),
      to: toDateStr(end),
      label: `${start.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} – ${end.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`,
    }
  }
  if (mode === 'month') {
    const start = new Date(anchor.getFullYear(), anchor.getMonth(), 1)
    const end = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0)
    return { from: toDateStr(start), to: toDateStr(end), label: start.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }) }
  }
  return { from: customFrom, to: customTo, label: '' }
}

const tabStyle = (active: boolean): React.CSSProperties => ({
  padding: '7px 16px', borderRadius: 20, border: `1.5px solid ${active ? 'var(--m)' : 'var(--gm)'}`,
  background: active ? 'var(--m)' : '#fff', color: active ? '#fff' : 'var(--tx)',
  fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'Poppins,sans-serif',
})

export default function AttendancePage() {
  const [engineers, setEngineers] = useState<AttendanceEngineer[]>([])
  const [dates, setDates] = useState<string[]>([])
  const [cells, setCells] = useState<AttendanceCells>({})
  const [currentUser, setCurrentUser] = useState({ name: '', role: '' })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const supabase = createClient()

  const [viewMode, setViewMode] = useState<ViewMode>('week')
  const [anchorDate, setAnchorDate] = useState(new Date())
  const todayForInputs = toDateStr(new Date())
  const [customFrom, setCustomFrom] = useState(todayForInputs)
  const [customTo, setCustomTo] = useState(todayForInputs)

  const range = useMemo(() => getRange(viewMode, anchorDate, customFrom, customTo), [viewMode, anchorDate, customFrom, customTo])
  const customInvalid = viewMode === 'custom' && (!customFrom || !customTo || customFrom > customTo)

  const load = useCallback(async (from: string, to: string) => {
    setLoading(true)
    const { engineers: eng, dates: d, cells: c, error: err } = await getAttendanceGrid(from, to)
    setEngineers(eng)
    setDates(d)
    setCells(c)
    setError(err)
    setLoading(false)
  }, [])

  useEffect(() => {
    if (customInvalid) return
    load(range.from, range.to)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.from, range.to, customInvalid])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const userId = session?.user.id
      if (userId) supabase.from('profiles').select('first_name,last_name,role').eq('id', userId).single().then(({ data }) => {
        if (data) setCurrentUser({ name: `${data.first_name} ${data.last_name}`, role: data.role })
      })
    })
  }, [supabase])

  function selectMode(mode: ViewMode) {
    setViewMode(mode)
    if (mode !== 'custom') setAnchorDate(new Date())
  }

  function goPrev() {
    if (viewMode === 'week') setAnchorDate(d => { const n = new Date(d); n.setDate(n.getDate() - 7); return n })
    else if (viewMode === 'month') setAnchorDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))
  }
  function goNext() {
    if (viewMode === 'week') setAnchorDate(d => { const n = new Date(d); n.setDate(n.getDate() + 7); return n })
    else if (viewMode === 'month') setAnchorDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))
  }

  const todayStr = new Date().toLocaleDateString('en-CA')

  return (
    <>
      <Topbar title="Attendance" userName={currentUser.name} userRole={currentUser.role} />
      {/* min-width/min-height: 0 on every level of this flex chain is load-bearing —
          without it, a flex item won't shrink below its content's intrinsic size
          (in either axis), so the wide table forces the page itself to grow and
          scroll instead of being contained inside the grid's own scrollbox. */}
      <div style={{ flex: 1, minHeight: 0, minWidth: 0, padding: '22px 24px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ fontSize: 12, color: 'var(--txm)', marginBottom: 14, flexShrink: 0 }}>
          Scheduled jobs by field engineer. Past dates show what actually happened that day; today and upcoming dates show the job&apos;s current status.
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14, flexShrink: 0 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={tabStyle(viewMode === 'week')} onClick={() => selectMode('week')}>This Week</button>
            <button style={tabStyle(viewMode === 'month')} onClick={() => selectMode('month')}>This Month</button>
            <button style={tabStyle(viewMode === 'custom')} onClick={() => selectMode('custom')}>Custom</button>
          </div>

          {viewMode !== 'custom' ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button onClick={goPrev} aria-label="Previous"
                style={{ width: 30, height: 30, borderRadius: 7, border: '1px solid var(--gm)', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="14" height="14" fill="none" stroke="var(--tx)" strokeWidth="2" viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6" /></svg>
              </button>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--tx)', minWidth: 160, textAlign: 'center' }}>{range.label}</span>
              <button onClick={goNext} aria-label="Next"
                style={{ width: 30, height: 30, borderRadius: 7, border: '1px solid var(--gm)', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="14" height="14" fill="none" stroke="var(--tx)" strokeWidth="2" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6" /></svg>
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <label style={{ fontSize: 11, fontWeight: 500, color: 'var(--txm)' }}>From</label>
              <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                style={{ padding: '7px 10px', border: '1.5px solid var(--gm)', borderRadius: 7, fontSize: 12, outline: 'none', fontFamily: 'Poppins,sans-serif' }} />
              <label style={{ fontSize: 11, fontWeight: 500, color: 'var(--txm)' }}>To</label>
              <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
                style={{ padding: '7px 10px', border: '1.5px solid var(--gm)', borderRadius: 7, fontSize: 12, outline: 'none', fontFamily: 'Poppins,sans-serif' }} />
              {customInvalid && <span style={{ fontSize: 11, color: '#DC2626' }}>Pick a valid range (From must be on or before To).</span>}
            </div>
          )}
        </div>

        {error && (
          <div style={{ background: '#FEE2E2', color: '#DC2626', borderRadius: 8, padding: '10px 12px', fontSize: 12, marginBottom: 14, flexShrink: 0 }}>{error}</div>
        )}

        <div style={{ background: '#fff', borderRadius: 10, border: '1px solid var(--gm)', overflow: 'hidden', flex: 1, minHeight: 0, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--txm)', fontSize: 13 }}>Loading attendance…</div>
          ) : engineers.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--txm)', fontSize: 13 }}>No field engineers found.</div>
          ) : (
            // Grid scrolls within its own box (both axes) rather than the page, so the
            // header row (top) and Field Engineer column (left) can use plain
            // position: sticky relative to a predictable scrollport instead of trying
            // to track the page's scroll position / Topbar height.
            <div style={{ overflow: 'auto', flex: 1, minHeight: 0 }}>
              <table style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
                <thead>
                  <tr>
                    <th style={{
                      position: 'sticky', top: 0, left: 0, zIndex: 3, minWidth: 170, padding: '9px 14px', textAlign: 'left', fontSize: 10, fontWeight: 600,
                      color: 'var(--txm)', textTransform: 'uppercase', letterSpacing: '.5px', borderBottom: '1px solid var(--gm)', borderRight: '1px solid var(--gm)',
                      background: '#FAFAFA', whiteSpace: 'nowrap',
                    }}>
                      Field Engineer
                    </th>
                    {dates.map(dateStr => {
                      const { weekday, dayMonth } = formatColumnDate(dateStr)
                      const isToday = dateStr === todayStr
                      const isPast = dateStr < todayStr
                      const isWeekend = weekday === 'Sun' || weekday === 'Sat'
                      return (
                        <th key={dateStr} style={{
                          position: 'sticky', top: 0, zIndex: 2, minWidth: 190, padding: '9px 10px', textAlign: 'center', fontSize: 10, fontWeight: 600,
                          color: isToday ? 'var(--m)' : isPast ? '#B0A8AC' : 'var(--txm)', borderBottom: '1px solid var(--gm)',
                          background: isToday ? 'var(--mp)' : isPast ? '#F5F3F5' : isWeekend ? '#FAFAFA' : '#fff', whiteSpace: 'nowrap',
                        }}>
                          <div>{weekday}</div>
                          <div style={{ fontSize: 11, marginTop: 1 }}>{dayMonth}</div>
                        </th>
                      )
                    })}
                  </tr>
                </thead>
                <tbody>
                  {engineers.map((e, ei) => (
                    <tr key={e.id}>
                      <td style={{
                        position: 'sticky', left: 0, zIndex: 1, padding: '10px 14px', fontSize: 12, fontWeight: 600, color: 'var(--tx)',
                        background: '#fff', borderRight: '1px solid var(--gm)',
                        borderBottom: ei < engineers.length - 1 ? '1px solid var(--gm)' : 'none', whiteSpace: 'nowrap', verticalAlign: 'top',
                      }}>
                        {e.name}
                      </td>
                      {dates.map(dateStr => {
                        const jobs = cells[e.id]?.[dateStr]
                        const isToday = dateStr === todayStr
                        const isPast = dateStr < todayStr
                        return (
                          <td key={dateStr} style={{
                            padding: '8px 8px', fontSize: 11, textAlign: 'left', verticalAlign: 'top',
                            background: isToday ? '#FDF7F9' : isPast ? '#FBFAFB' : '#fff',
                            borderBottom: ei < engineers.length - 1 ? '1px solid var(--gl)' : 'none',
                          }}>
                            {jobs && jobs.length > 0 ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                {jobs.map(job => {
                                  const cfg = STATUS_CFG[job.status] || STATUS_CFG.unassigned
                                  return (
                                    <div key={job.workOrderId} style={{ padding: '6px 8px', borderRadius: 7, background: '#F8F5F6', border: '1px solid var(--gl)' }}>
                                      <div style={{ fontWeight: 600, color: 'var(--tx)', fontSize: 11 }}>{job.customerName}</div>
                                      {job.location && <div style={{ color: 'var(--txm)', fontSize: 10, marginTop: 2 }}>{job.location}</div>}
                                      <div style={{ color: 'var(--txm)', fontSize: 10, marginTop: 2 }}>{job.woNumber}</div>
                                      <span style={{ display: 'inline-block', marginTop: 4, fontSize: 9, fontWeight: 600, padding: '1px 7px', borderRadius: 10, background: cfg.bg, color: cfg.color }}>
                                        {cfg.label}
                                      </span>
                                    </div>
                                  )
                                })}
                              </div>
                            ) : (
                              <span style={{ color: 'var(--txm)' }}>—</span>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
