'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { getDashboardCharts } from '@/app/actions/get-dashboard-charts'
import { getRange, type ViewMode } from '@/app/(app)/attendance/dateRange'
import { useAutoRefresh } from '@/lib/useAutoRefresh'
import type { DashboardChartsData, ChartWindow, SeriesItem } from '@/lib/dashboardCharts'

// ── geometry ──────────────────────────────────────────────────────────────
type Geo = { W: number; H: number; l: number; r: number; t: number; b: number }
const HALF: Geo = { W: 560, H: 270, l: 32, r: 10, t: 16, b: 30 }
const WIDE: Geo = { W: 1140, H: 300, l: 36, r: 14, t: 16, b: 30 }

const AXIS = '#7A6870'
const GRID = '#E5E0E3'

// ── colours ───────────────────────────────────────────────────────────────
const STATUS_COLORS: Record<string, string> = {
  unassigned: '#6B7280', assigned: '#1D4ED8', in_progress: '#D97706',
  needs_reassignment: '#9A3412', completed: '#059669', closed: '#0891B2',
}
const STATUS_ROWS: { key: keyof DashboardChartsData['status']; label: string }[] = [
  { key: 'unassigned', label: 'Unassigned' }, { key: 'assigned', label: 'Assigned' },
  { key: 'in_progress', label: 'In Progress' }, { key: 'needs_reassignment', label: 'Reassign' },
  { key: 'completed', label: 'Completed' }, { key: 'closed', label: 'Closed' },
]
const WARR_ROWS: { key: keyof DashboardChartsData['warranty']; label: string; color: string }[] = [
  { key: 'underWarranty', label: 'Under Warranty', color: '#22C55E' },
  { key: 'expiring', label: 'Expiring (3mo)', color: '#F59E0B' },
  { key: 'noWarranty', label: 'No Warranty', color: '#EF4444' },
]
const PAL = ['#3B82F6', '#22C55E', '#F59E0B', '#EC4899', '#06B6D4', '#A855F7', '#F97316', '#14B8A6']

interface TipRow { color: string; label: string; value: number }
interface TipState { show: boolean; x: number; y: number; title: string; rows: TipRow[] }
type SetTip = (t: Partial<TipState> & { show: boolean }) => void

// ── nice integer axis ───────────────────────────────────────────────────────
function niceStep(raw: number): number {
  if (raw <= 0) return 1
  const p = Math.pow(10, Math.floor(Math.log10(raw)))
  const m = raw / p
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p
}
function niceAxis(max: number): { ymax: number; ticks: number[] } {
  const m = Math.max(1, max)
  const step = Math.max(1, niceStep(m / 4))
  const ymax = Math.max(step, Math.ceil(m / step) * step)
  const ticks: number[] = []
  for (let v = 0; v <= ymax + 1e-9; v += step) ticks.push(v)
  return { ymax, ticks }
}

function Axes({ g, ymax, ticks }: { g: Geo; ymax: number; ticks: number[] }) {
  const IH = g.H - g.t - g.b
  return (
    <>
      {ticks.map(v => {
        const y = g.t + IH - (IH * v) / ymax
        return (
          <g key={v}>
            <line x1={g.l} y1={y} x2={g.W - g.r} y2={y} stroke={GRID} strokeWidth={1} />
            <text x={g.l - 6} y={y + 3} textAnchor="end" fontSize={10} fill={AXIS}>{v}</text>
          </g>
        )
      })}
    </>
  )
}

function Legend({ items }: { items: { color: string; label: string }[] }) {
  return (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 8 }}>
      {items.map(s => (
        <span key={s.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--txm)' }}>
          <i style={{ width: 10, height: 10, borderRadius: 3, background: s.color, display: 'inline-block' }} />{s.label}
        </span>
      ))}
    </div>
  )
}

function Card({ title, caption, children }: { title: string; caption: string; children: React.ReactNode }) {
  return (
    <div style={{ background: '#fff', border: '1px solid var(--gm)', borderRadius: 14, padding: '16px 18px' }}>
      <h3 style={{ fontSize: 14, margin: '0 0 2px', color: 'var(--tx)' }}>{title}</h3>
      <p style={{ color: 'var(--txm)', fontSize: 11.5, margin: '0 0 10px' }}>{caption}</p>
      {children}
    </div>
  )
}

const svgStyle: React.CSSProperties = { display: 'block', width: '100%', height: 'auto', overflow: 'visible' }

function SnapshotBar({ data, setTip, g = HALF }: { data: { label: string; value: number; color: string }[]; setTip: SetTip; g?: Geo }) {
  const IW = g.W - g.l - g.r, IH = g.H - g.t - g.b
  const { ymax, ticks } = niceAxis(Math.max(0, ...data.map(d => d.value)))
  const gw = IW / data.length, barw = Math.min(54, gw * 0.6)
  return (
    <svg viewBox={`0 0 ${g.W} ${g.H}`} style={svgStyle}>
      <Axes g={g} ymax={ymax} ticks={ticks} />
      {data.map((d, i) => {
        const x = g.l + gw * i + (gw - barw) / 2
        const hh = (IH * d.value) / ymax, y = g.t + IH - hh
        return (
          <g key={d.label}>
            <rect x={x} y={y} width={barw} height={hh} rx={4} fill={d.color}
              onMouseMove={e => setTip({ show: true, x: e.clientX, y: e.clientY, title: d.label, rows: [{ color: d.color, label: d.label, value: d.value }] })}
              onMouseLeave={() => setTip({ show: false })} />
            <text x={x + barw / 2} y={y - 5} textAnchor="middle" fontSize={11} fontWeight={700} fill={AXIS}>{d.value}</text>
            <text x={x + barw / 2} y={g.H - g.b + 15} textAnchor="middle" fontSize={8.5} fill={AXIS}>{d.label}</text>
          </g>
        )
      })}
    </svg>
  )
}

function Grouped({ cats, series, setTip, titles, g = HALF }: { cats: string[]; series: { label: string; data: number[]; color: string }[]; setTip: SetTip; titles?: string[]; g?: Geo }) {
  const tt = (i: number) => titles?.[i] ?? cats[i]
  const IW = g.W - g.l - g.r, IH = g.H - g.t - g.b
  const { ymax, ticks } = niceAxis(Math.max(0, ...series.flatMap(s => s.data)))
  const gw = IW / Math.max(1, cats.length), inner = gw * 0.72, bw = inner / Math.max(1, series.length)
  return (
    <svg viewBox={`0 0 ${g.W} ${g.H}`} style={svgStyle}>
      <Axes g={g} ymax={ymax} ticks={ticks} />
      {cats.map((c, ci) => {
        const gx = g.l + gw * ci + (gw - inner) / 2
        return (
          <g key={ci}>
            {series.map((s, si) => {
              const v = s.data[ci] || 0, hh = (IH * v) / ymax, x = gx + bw * si, y = g.t + IH - hh
              return <rect key={si} x={x + 0.5} y={y} width={Math.max(1, bw - 1)} height={hh} rx={2} fill={s.color}
                onMouseMove={e => setTip({ show: true, x: e.clientX, y: e.clientY, title: tt(ci), rows: [{ color: s.color, label: s.label, value: v }] })}
                onMouseLeave={() => setTip({ show: false })} />
            })}
            <text x={gx + inner / 2} y={g.H - g.b + 15} textAnchor="middle" fontSize={10} fill={AXIS}>{c}</text>
          </g>
        )
      })}
    </svg>
  )
}

function Stacked({ cats, series, setTip, titles, g = HALF }: { cats: string[]; series: SeriesItem[]; setTip: SetTip; titles?: string[]; g?: Geo }) {
  const tt = (i: number) => titles?.[i] ?? cats[i]
  const IW = g.W - g.l - g.r, IH = g.H - g.t - g.b
  const totals = cats.map((_, i) => series.reduce((a, s) => a + (s.data[i] || 0), 0))
  const { ymax, ticks } = niceAxis(Math.max(0, ...totals))
  const gw = IW / Math.max(1, cats.length), barw = Math.min(42, gw * 0.58)
  return (
    <svg viewBox={`0 0 ${g.W} ${g.H}`} style={svgStyle}>
      <Axes g={g} ymax={ymax} ticks={ticks} />
      {cats.map((c, ci) => {
        let acc = 0
        const x = g.l + gw * ci + (gw - barw) / 2
        return (
          <g key={ci}>
            {series.map((s, si) => {
              const v = s.data[ci] || 0, hh = (IH * v) / ymax, y = g.t + IH - (IH * (acc + v)) / ymax
              acc += v
              if (v === 0) return null
              return <rect key={si} x={x} y={y} width={barw} height={hh} fill={PAL[si % PAL.length]}
                onMouseMove={e => setTip({ show: true, x: e.clientX, y: e.clientY, title: tt(ci), rows: [{ color: PAL[si % PAL.length], label: s.label, value: v }] })}
                onMouseLeave={() => setTip({ show: false })} />
            })}
            <text x={x + barw / 2} y={g.H - g.b + 15} textAnchor="middle" fontSize={10} fill={AXIS}>{c}</text>
          </g>
        )
      })}
    </svg>
  )
}

function LineCombined({ cats, series, setTip, titles, g = WIDE }: { cats: string[]; series: { label: string; data: number[]; color: string }[]; setTip: SetTip; titles?: string[]; g?: Geo }) {
  const IW = g.W - g.l - g.r, IH = g.H - g.t - g.b
  const { ymax, ticks } = niceAxis(Math.max(0, ...series.flatMap(s => s.data)))
  const gw = IW / Math.max(1, cats.length)
  const X = (i: number) => g.l + gw * i + gw / 2
  const Y = (v: number) => g.t + IH - (IH * v) / ymax
  const [guide, setGuide] = useState(-1)
  return (
    <svg viewBox={`0 0 ${g.W} ${g.H}`} style={svgStyle}>
      <Axes g={g} ymax={ymax} ticks={ticks} />
      {guide >= 0 && <line x1={X(guide)} y1={g.t} x2={X(guide)} y2={g.t + IH} stroke={AXIS} strokeWidth={1} strokeDasharray="3 3" />}
      {series.map(s => (
        <g key={s.label}>
          <path d={s.data.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join(' ')} fill="none" stroke={s.color} strokeWidth={2.4} strokeLinejoin="round" strokeLinecap="round" />
          {s.data.map((v, i) => <circle key={i} cx={X(i)} cy={Y(v)} r={3} fill={s.color} />)}
        </g>
      ))}
      {cats.map((c, i) => <text key={i} x={X(i)} y={g.H - g.b + 15} textAnchor="middle" fontSize={10} fill={AXIS}>{c}</text>)}
      <rect x={g.l} y={g.t} width={IW} height={IH} fill="transparent"
        onMouseMove={e => {
          const rect = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect()
          const vx = ((e.clientX - rect.left) / rect.width) * g.W
          let idx = Math.round((vx - (g.l + gw / 2)) / gw)
          idx = Math.max(0, Math.min(cats.length - 1, idx))
          setGuide(idx)
          setTip({ show: true, x: e.clientX, y: e.clientY, title: titles?.[idx] ?? cats[idx], rows: series.map(s => ({ color: s.color, label: s.label, value: s.data[idx] || 0 })) })
        }}
        onMouseLeave={() => { setGuide(-1); setTip({ show: false }) }} />
    </svg>
  )
}

// ── main ───────────────────────────────────────────────────────────────────
const CARD_GAP = 16
const ROW: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: CARD_GAP }

export default function DashboardChartsSection() {
  // Period selector (This Week / This Month / Custom + prev-next nav), mirroring Reports.
  const [viewMode, setViewMode] = useState<ViewMode>('month')
  const [anchor, setAnchor] = useState(new Date())
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const range = useMemo(() => getRange(viewMode, anchor, customFrom, customTo), [viewMode, anchor, customFrom, customTo])
  const customInvalid = viewMode === 'custom' && !!customFrom && !!customTo && customFrom > customTo
  const effFrom = viewMode === 'custom' ? (customInvalid ? '' : customFrom) : range.from
  const effTo = viewMode === 'custom' ? (customInvalid ? '' : customTo) : range.to

  function selectMode(m: ViewMode) {
    setViewMode(m)
    if (m !== 'custom') setAnchor(new Date())
    else if (!customFrom) { const r = getRange('week', new Date(), '', ''); setCustomFrom(r.from); setCustomTo(r.to) }
  }
  function shift(delta: number) {
    const a = new Date(anchor)
    if (viewMode === 'week') a.setDate(a.getDate() + delta * 7)
    else if (viewMode === 'month') a.setMonth(a.getMonth() + delta)
    setAnchor(a)
  }

  const [data, setData] = useState<DashboardChartsData | null>(null)
  const [loading, setLoading] = useState(true)

  // Fetch whenever the effective range changes. Keep the previous chart visible while the
  // new data loads (no flicker); only the very first load shows a placeholder.
  useEffect(() => {
    if (!effFrom || !effTo) return
    let cancelled = false
    getDashboardCharts({ from: effFrom, to: effTo }).then(d => { if (!cancelled) { setData(d); setLoading(false) } })
    return () => { cancelled = true }
  }, [effFrom, effTo])

  // Silent background refresh — this card updates in place, no page reload.
  const rangeRef = useRef({ from: effFrom, to: effTo })
  rangeRef.current = { from: effFrom, to: effTo }
  useAutoRefresh(() => {
    const { from, to } = rangeRef.current
    if (from && to) getDashboardCharts({ from, to }).then(setData)
  }, 45000)

  const [tip, setTipState] = useState<TipState>({ show: false, x: 0, y: 0, title: '', rows: [] })
  const setTip: SetTip = t => setTipState(prev => ({ ...prev, ...t }))

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: '7px 16px', borderRadius: 20, border: `1.5px solid ${active ? 'var(--m)' : 'var(--gm)'}`,
    background: active ? 'var(--m)' : '#fff', color: active ? '#fff' : 'var(--tx)',
    fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'Poppins,sans-serif',
  })
  const navBtn: React.CSSProperties = { width: 30, height: 30, borderRadius: 7, border: '1px solid var(--gm)', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }
  const dateInput: React.CSSProperties = { padding: '7px 10px', border: '1.5px solid var(--gm)', borderRadius: 7, fontSize: 12, outline: 'none', fontFamily: 'Poppins,sans-serif' }

  const periodSelector = (
    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 14, marginBottom: 12 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <button style={tabStyle(viewMode === 'week')} onClick={() => selectMode('week')}>This Week</button>
        <button style={tabStyle(viewMode === 'month')} onClick={() => selectMode('month')}>This Month</button>
        <button style={tabStyle(viewMode === 'custom')} onClick={() => selectMode('custom')}>Custom</button>
      </div>
      {viewMode !== 'custom' ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => shift(-1)} aria-label="Previous" style={navBtn}>
            <svg width="14" height="14" fill="none" stroke="var(--tx)" strokeWidth="2" viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6" /></svg>
          </button>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--tx)', minWidth: 170, textAlign: 'center' }}>{range.label}</span>
          <button onClick={() => shift(1)} aria-label="Next" style={navBtn}>
            <svg width="14" height="14" fill="none" stroke="var(--tx)" strokeWidth="2" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6" /></svg>
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <label style={{ fontSize: 11, fontWeight: 500, color: 'var(--txm)' }}>From</label>
          <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} style={dateInput} />
          <label style={{ fontSize: 11, fontWeight: 500, color: 'var(--txm)' }}>To</label>
          <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} style={dateInput} />
          {customInvalid && <span style={{ fontSize: 11, color: '#DC2626' }}>Pick a valid range (From on or before To).</span>}
        </div>
      )}
    </div>
  )

  const w: ChartWindow | undefined = data?.window
  const flip = typeof window !== 'undefined' && tip.x > window.innerWidth - 190

  return (
    <div style={{ marginBottom: 14 }}>
      {/* Snapshots — current totals, independent of the period selector */}
      <div style={{ fontSize: 11, color: 'var(--txm)', margin: '4px 2px 8px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.5px' }}>Snapshots — current totals</div>
      <div style={{ ...ROW, marginBottom: CARD_GAP }}>
        <Card title="Notifications by status" caption="Snapshot of the six statuses">
          {data ? <SnapshotBar data={STATUS_ROWS.map(r => ({ label: r.label, value: data.status[r.key], color: STATUS_COLORS[r.key] }))} setTip={setTip} /> : <ChartSkeleton />}
        </Card>
        <Card title="Open notifications by warranty" caption="Open notifications by their transformer’s warranty state">
          {data ? <SnapshotBar data={WARR_ROWS.map(r => ({ label: r.label, value: data.warranty[r.key], color: r.color }))} setTip={setTip} /> : <ChartSkeleton />}
        </Card>
      </div>

      <div style={{ fontSize: 11, color: 'var(--txm)', margin: '4px 2px 8px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.5px' }}>Trends</div>
      {periodSelector}

      {!w ? (
        <div style={{ background: '#fff', border: '1px solid var(--gm)', borderRadius: 14, padding: 40, textAlign: 'center', color: 'var(--txm)', fontSize: 13 }}>
          {loading ? 'Loading charts…' : 'No data for this period.'}
        </div>
      ) : (
        <>
          <div style={{ marginBottom: CARD_GAP }}>
            <Card title="Created vs Completed vs Closed" caption="Hover any week to see its range and Created / Completed / Closed">
              <LineCombined cats={w.labels} titles={w.ranges} setTip={setTip} series={[
                { label: 'Created', data: w.ccc.created, color: '#2563EB' },
                { label: 'Completed', data: w.ccc.completed, color: '#F59E0B' },
                { label: 'Closed', data: w.ccc.closed, color: '#22C55E' },
              ]} />
              <Legend items={[{ color: '#2563EB', label: 'Created' }, { color: '#F59E0B', label: 'Completed' }, { color: '#22C55E', label: 'Closed' }]} />
            </Card>
          </div>

          <div style={{ ...ROW, marginBottom: CARD_GAP }}>
            <Card title="Paid vs Total notifications" caption="Paid = Overhauling, against all notifications">
              <Grouped cats={w.labels} titles={w.ranges} setTip={setTip} series={[
                { label: 'Total', data: w.pt.total, color: '#C9AEB8' },
                { label: 'Paid', data: w.pt.paid, color: '#7D1D3F' },
              ]} />
              <Legend items={[{ color: '#C9AEB8', label: 'Total' }, { color: '#7D1D3F', label: 'Paid' }]} />
            </Card>
            <Card title="Spare requests" caption="By the week raised — requested, then how many approved / dispatched">
              <Grouped cats={w.labels} titles={w.ranges} setTip={setTip} series={[
                { label: 'Requested', data: w.spare.requested, color: '#F59E0B' },
                { label: 'Approved', data: w.spare.approved, color: '#3B82F6' },
                { label: 'Dispatched', data: w.spare.dispatched, color: '#A855F7' },
              ]} />
              <Legend items={[{ color: '#F59E0B', label: 'Requested' }, { color: '#3B82F6', label: 'Approved' }, { color: '#A855F7', label: 'Dispatched' }]} />
            </Card>
          </div>

          <div style={ROW}>
            <Card title="Notifications by Job type" caption="Created per week, by job type">
              <Stacked cats={w.labels} titles={w.ranges} series={w.job} setTip={setTip} />
              <Legend items={w.job.map((s, i) => ({ color: PAL[i % PAL.length], label: s.label }))} />
            </Card>
            <Card title="Notifications by Department" caption="Created per week, by department">
              <Stacked cats={w.labels} titles={w.ranges} series={w.dept} setTip={setTip} />
              <Legend items={w.dept.map((s, i) => ({ color: PAL[i % PAL.length], label: s.label }))} />
            </Card>
          </div>
        </>
      )}

      {tip.show && (
        <div style={{
          position: 'fixed', left: flip ? tip.x - 14 : tip.x + 14, top: Math.max(8, tip.y - 10),
          transform: flip ? 'translateX(-100%)' : 'none',
          pointerEvents: 'none', zIndex: 50, background: 'var(--tx)', color: '#fff', fontSize: 11,
          padding: '7px 9px', borderRadius: 7, whiteSpace: 'nowrap', fontWeight: 500, lineHeight: 1.7,
        }}>
          <div style={{ fontWeight: 700 }}>{tip.title}</div>
          {tip.rows.map(r => (
            <div key={r.label}>
              <i style={{ width: 8, height: 8, borderRadius: 2, display: 'inline-block', marginRight: 5, background: r.color }} />
              {r.label}: <b>{r.value}</b>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ChartSkeleton() {
  return <div style={{ height: 150, borderRadius: 8, background: 'var(--gl)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--txm)', fontSize: 12 }}>Loading…</div>
}
