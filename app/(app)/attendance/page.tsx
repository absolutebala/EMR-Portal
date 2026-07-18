'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import Topbar from '@/components/layout/Topbar'
import { getAttendanceGrid, type AttendanceEngineer, type AttendanceCells } from '@/app/actions/get-attendance'

function formatColumnDate(dateStr: string): { weekday: string; dayMonth: string } {
  const d = new Date(`${dateStr}T00:00:00`)
  return {
    weekday: d.toLocaleDateString('en-IN', { weekday: 'short' }),
    dayMonth: d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
  }
}

export default function AttendancePage() {
  const [engineers, setEngineers] = useState<AttendanceEngineer[]>([])
  const [dates, setDates] = useState<string[]>([])
  const [cells, setCells] = useState<AttendanceCells>({})
  const [currentUser, setCurrentUser] = useState({ name: '', role: '' })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const supabase = createClient()

  const load = useCallback(async () => {
    setLoading(true)
    const { engineers: eng, dates: d, cells: c, error: err } = await getAttendanceGrid()
    setEngineers(eng)
    setDates(d)
    setCells(c)
    setError(err)
    setLoading(false)
  }, [])

  useEffect(() => {
    const t = setTimeout(load, 0)
    supabase.auth.getSession().then(({ data: { session } }) => {
      const userId = session?.user.id
      if (userId) supabase.from('profiles').select('first_name,last_name,role').eq('id', userId).single().then(({ data }) => {
        if (data) setCurrentUser({ name: `${data.first_name} ${data.last_name}`, role: data.role })
      })
    })
    return () => clearTimeout(t)
  }, [load, supabase])

  const todayStr = new Date().toLocaleDateString('en-CA')

  return (
    <>
      <Topbar title="Attendance" userName={currentUser.name} userRole={currentUser.role} />
      {/* minHeight: 0 on every level of this flex chain is load-bearing — without it,
          a flex item won't shrink below its content size, so the page (not this box)
          ends up scrolling instead of the grid scrolling internally. */}
      <div style={{ flex: 1, minHeight: 0, padding: '22px 24px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ fontSize: 12, color: 'var(--txm)', marginBottom: 14, flexShrink: 0 }}>
          Scheduled jobs by field engineer, from today through the end of the month.
        </div>

        {error && (
          <div style={{ background: '#FEE2E2', color: '#DC2626', borderRadius: 8, padding: '10px 12px', fontSize: 12, marginBottom: 14, flexShrink: 0 }}>{error}</div>
        )}

        <div style={{ background: '#fff', borderRadius: 10, border: '1px solid var(--gm)', overflow: 'hidden', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
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
                      const isWeekend = weekday === 'Sun' || weekday === 'Sat'
                      return (
                        <th key={dateStr} style={{
                          position: 'sticky', top: 0, zIndex: 2, minWidth: 130, padding: '9px 10px', textAlign: 'center', fontSize: 10, fontWeight: 600,
                          color: isToday ? 'var(--m)' : 'var(--txm)', borderBottom: '1px solid var(--gm)',
                          background: isToday ? 'var(--mp)' : isWeekend ? '#FAFAFA' : '#fff', whiteSpace: 'nowrap',
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
                        borderBottom: ei < engineers.length - 1 ? '1px solid var(--gm)' : 'none', whiteSpace: 'nowrap',
                      }}>
                        {e.name}
                      </td>
                      {dates.map(dateStr => {
                        const names = cells[e.id]?.[dateStr]
                        const isToday = dateStr === todayStr
                        return (
                          <td key={dateStr} style={{
                            padding: '8px 10px', fontSize: 11, textAlign: 'center', color: names ? 'var(--tx)' : 'var(--txm)',
                            background: isToday ? '#FDF7F9' : '#fff', verticalAlign: 'top',
                            borderBottom: ei < engineers.length - 1 ? '1px solid var(--gl)' : 'none',
                          }}>
                            {names ? names.join(', ') : '—'}
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
