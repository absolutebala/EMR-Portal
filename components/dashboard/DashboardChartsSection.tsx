'use client'

import { useState } from 'react'
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
// Bright, well-separated palette for stacked charts.
const PAL = ['#3B82F6', '#22C55E', '#F59E0B', '#EC4899', '#06B6D4', '#A855F7', '#F97316', '#14B8A6']

interface TipRow { color: string; label: string; value: number }
interface TipState { show: boolean; x: number; y: number; title: string; rows: TipRow[] }
type SetTip = (t: Partial<TipState> & { show: boolean }) => void

// ── shared bits ─────────────────────────────────────────────────────────────
function niceMax(max: number) { return Math.max(10, Math.ceil(max / 10) * 10) }

function Axes({ g, ymax }: { g: Geo; ymax: number }) {
  const IH = g.H - g.t - g.b
  return (
    <>
      {[0, 1, 2, 3, 4].map(i => {
        const y = g.t + IH - (IH * i) / 4
        return (
          <g key={i}>
            <line x1={g.l} y1={y} x2={g.W - g.r} y2={y} stroke={GRID} strokeWidth={1} />
            <text x={g.l - 6} y={y + 3} textAnchor="end" fontSize={10} fill={AXIS}>{Math.round((ymax * i) / 4)}</text>
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

function Card({ title, caption, children }: { title: string; caption: string; children: React.ReactNode; }) {
  return (
    <div style={{ background: '#fff', border: '1px solid var(--gm)', borderRadius: 14, padding: '16px 18px' }}>
      <h3 style={{ fontSize: 14, margin: '0 0 2px', color: 'var(--tx)' }}>{title}</h3>
      <p style={{ color: 'var(--txm)', fontSize: 11.5, margin: '0 0 10px' }}>{caption}</p>
      {children}
    </div>
  )
}

const svgStyle: React.CSSProperties = { display: 'block', width: '100%', height: 'auto', overflow: 'visible' }

// ── simple labelled snapshot bars ───────────────────────────────────────────
function SnapshotBar({ data, setTip, g = HALF }: { data: { label: string; value: number; color: string }[]; setTip: SetTip; g?: Geo }) {
  const IW = g.W - g.l - g.r, IH = g.H - g.t - g.b
  const ymax = niceMax(Math.max(0, ...data.map(d => d.value)))
  const gw = IW / data.length, barw = Math.min(54, gw * 0.6)
  return (
    <svg viewBox={`0 0 ${g.W} ${g.H}`} style={svgStyle}>
      <Axes g={g} ymax={ymax} />
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

// ── grouped bars ─────────────────────────────────────────────────────────────
function Grouped({ cats, series, setTip, titles, g = HALF }: { cats: string[]; series: { label: string; data: number[]; color: string }[]; setTip: SetTip; titles?: string[]; g?: Geo }) {
  const tt = (i: number) => titles?.[i] ?? cats[i]
  const IW = g.W - g.l - g.r, IH = g.H - g.t - g.b
  const ymax = niceMax(Math.max(0, ...series.flatMap(s => s.data)))
  const gw = IW / Math.max(1, cats.length), inner = gw * 0.72, bw = inner / Math.max(1, series.length)
  return (
    <svg viewBox={`0 0 ${g.W} ${g.H}`} style={svgStyle}>
      <Axes g={g} ymax={ymax} />
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

// ── stacked bars ──────────────────────────────────────────────────────────────
function Stacked({ cats, series, setTip, titles, g = HALF }: { cats: string[]; series: SeriesItem[]; setTip: SetTip; titles?: string[]; g?: Geo }) {
  const tt = (i: number) => titles?.[i] ?? cats[i]
  const IW = g.W - g.l - g.r, IH = g.H - g.t - g.b
  const totals = cats.map((_, i) => series.reduce((a, s) => a + (s.data[i] || 0), 0))
  const ymax = niceMax(Math.max(0, ...totals))
  const gw = IW / Math.max(1, cats.length), barw = Math.min(42, gw * 0.58)
  return (
    <svg viewBox={`0 0 ${g.W} ${g.H}`} style={svgStyle}>
      <Axes g={g} ymax={ymax} />
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

// ── Created/Completed/Closed line, shared crosshair tooltip ─────────────────────
function LineCombined({ cats, series, setTip, titles, g = WIDE }: { cats: string[]; series: { label: string; data: number[]; color: string }[]; setTip: SetTip; titles?: string[]; g?: Geo }) {
  const IW = g.W - g.l - g.r, IH = g.H - g.t - g.b
  const ymax = niceMax(Math.max(0, ...series.flatMap(s => s.data)))
  const gw = IW / Math.max(1, cats.length)
  const X = (i: number) => g.l + gw * i + gw / 2
  const Y = (v: number) => g.t + IH - (IH * v) / ymax
  const [guide, setGuide] = useState(-1)
  return (
    <svg viewBox={`0 0 ${g.W} ${g.H}`} style={svgStyle}>
      <Axes g={g} ymax={ymax} />
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

export default function DashboardChartsSection({ data }: { data: DashboardChartsData }) {
  const [win, setWin] = useState<'weeks' | 'month'>('weeks')
  const [tip, setTipState] = useState<TipState>({ show: false, x: 0, y: 0, title: '', rows: [] })
  const setTip: SetTip = t => setTipState(prev => ({ ...prev, ...t }))
  const w: ChartWindow = data[win]

  const statusData = STATUS_ROWS.map(r => ({ label: r.label, value: data.status[r.key], color: STATUS_COLORS[r.key] }))
  const warrData = WARR_ROWS.map(r => ({ label: r.label, value: data.warranty[r.key], color: r.color }))
  const ccc = [
    { label: 'Created', data: w.ccc.created, color: '#2563EB' },
    { label: 'Completed', data: w.ccc.completed, color: '#F59E0B' },
    { label: 'Closed', data: w.ccc.closed, color: '#22C55E' },
  ]
  const pt = [
    { label: 'Total', data: w.pt.total, color: '#C9AEB8' },
    { label: 'Paid', data: w.pt.paid, color: '#7D1D3F' },
  ]
  const spare = [
    { label: 'Requested', data: w.spare.requested, color: '#F59E0B' },
    { label: 'Approved', data: w.spare.approved, color: '#3B82F6' },
    { label: 'Dispatched', data: w.spare.dispatched, color: '#A855F7' },
  ]

  const toggleBtn = (val: 'weeks' | 'month', label: string) => (
    <button onClick={() => setWin(val)} style={{
      border: 'none', background: win === val ? 'var(--m)' : 'transparent', color: win === val ? '#fff' : 'var(--txm)',
      fontSize: 12, fontWeight: 600, padding: '6px 15px', cursor: 'pointer', fontFamily: 'Poppins,sans-serif',
    }}>{label}</button>
  )

  return (
    <div style={{ marginBottom: 14 }}>
      {/* Snapshots — not affected by the window toggle */}
      <div style={{ fontSize: 11, color: 'var(--txm)', margin: '4px 2px 8px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.5px' }}>Snapshots — current totals</div>
      <div style={{ ...ROW, marginBottom: CARD_GAP }}>
        <Card title="Notifications by status" caption="Snapshot of the six statuses">
          <SnapshotBar data={statusData} setTip={setTip} />
        </Card>
        <Card title="Open notifications by warranty" caption="Open notifications by their transformer’s warranty state">
          <SnapshotBar data={warrData} setTip={setTip} />
        </Card>
      </div>

      {/* Window toggle drives the weekly charts below */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.5px', textTransform: 'uppercase', color: 'var(--txm)' }}>Trends</span>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--txm)', fontWeight: 600 }}>Window:</span>
        <span style={{ display: 'inline-flex', border: '1px solid var(--gm)', borderRadius: 20, overflow: 'hidden', background: '#fff' }}>
          {toggleBtn('weeks', '8 weeks')}{toggleBtn('month', 'This month')}
        </span>
      </div>

      <div style={{ marginBottom: CARD_GAP }}>
        <Card title="Created vs Completed vs Closed" caption="Hover any week to see its range and Created / Completed / Closed">
          <LineCombined cats={w.labels} series={ccc} setTip={setTip} titles={w.ranges} />
          <Legend items={ccc} />
        </Card>
      </div>

      <div style={{ ...ROW, marginBottom: CARD_GAP }}>
        <Card title="Paid vs Total notifications" caption="Paid = Overhauling, against all notifications">
          <Grouped cats={w.labels} series={pt} setTip={setTip} titles={w.ranges} />
          <Legend items={pt} />
        </Card>
        <Card title="Spare requests" caption="Spare (material) requests per week, by stage">
          <Grouped cats={w.labels} series={spare} setTip={setTip} titles={w.ranges} />
          <Legend items={spare} />
        </Card>
      </div>

      <div style={ROW}>
        <Card title="Notifications by Job type" caption="Created per week, by job type">
          <Stacked cats={w.labels} series={w.job} setTip={setTip} titles={w.ranges} />
          <Legend items={w.job.map((s, i) => ({ color: PAL[i % PAL.length], label: s.label }))} />
        </Card>
        <Card title="Notifications by Department" caption="Created per week, by department">
          <Stacked cats={w.labels} series={w.dept} setTip={setTip} titles={w.ranges} />
          <Legend items={w.dept.map((s, i) => ({ color: PAL[i % PAL.length], label: s.label }))} />
        </Card>
      </div>

      {tip.show && (
        <div style={{
          position: 'fixed', left: tip.x + 14, top: tip.y - 10, pointerEvents: 'none', zIndex: 50,
          background: 'var(--tx)', color: '#fff', fontSize: 11, padding: '7px 9px', borderRadius: 7,
          whiteSpace: 'nowrap', fontWeight: 500, lineHeight: 1.7,
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
