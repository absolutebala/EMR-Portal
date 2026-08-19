// Shared presentational pieces for the Dashboard's list-style cards — plain
// components with no client/server directive so both the server-rendered page
// and client-side interactive cards (e.g. AssignableList) can use identical styling.
import Link from 'next/link'

export function ListCard({ title, viewAllHref, empty, children }: { title: string; viewAllHref?: string; empty: string; children: React.ReactNode }) {
  const hasContent = Array.isArray(children) ? children.length > 0 : !!children
  return (
    <div style={{ background: '#fff', borderRadius: 10, border: '1px solid var(--gm)', overflow: 'hidden' }}>
      <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--gm)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--tx)' }}>{title}</span>
        {viewAllHref && <Link href={viewAllHref} style={{ fontSize: 11, color: 'var(--m)', fontWeight: 500, textDecoration: 'none' }}>View all →</Link>}
      </div>
      <div>
        {hasContent ? children : (
          <div style={{ padding: '24px 14px', textAlign: 'center', color: 'var(--txm)', fontSize: 12 }}>{empty}</div>
        )}
      </div>
    </div>
  )
}

export function ListRow({ title, subtitle, href, onClick, children }: {
  title: string; subtitle?: React.ReactNode; href?: string; onClick?: () => void; children?: React.ReactNode
}) {
  const content = (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, padding: '10px 14px', borderTop: '1px solid var(--gl)' }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--tx)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</div>
        {subtitle && <div style={{ fontSize: 10, color: 'var(--txm)', marginTop: 1, lineHeight: 1.5 }}>{subtitle}</div>}
      </div>
      {children && <div style={{ flexShrink: 0 }}>{children}</div>}
    </div>
  )
  if (onClick) return <button onClick={onClick} style={{ all: 'unset', display: 'block', width: '100%', cursor: 'pointer', boxSizing: 'border-box' }}>{content}</button>
  return href ? <Link href={href} style={{ textDecoration: 'none', display: 'block' }}>{content}</Link> : content
}

export function Badge({ bg, color, label }: { bg: string; color: string; label: string }) {
  return (
    <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, fontWeight: 600, background: bg, color, whiteSpace: 'nowrap' }}>
      {label}
    </span>
  )
}

// Small summary-card pattern shared by the top-of-dashboard KPI cards (Notifications,
// Product Requests, Warranty Status) — a total, then a clickable list of the
// statuses/tiers that make it up.
export function BreakdownCard({ title, total, borderColor, rows }: {
  title: string
  total: number
  borderColor: string
  rows: { key: string; label: string; count: number; color: string; href: string }[]
}) {
  return (
    <div style={{ background: '#fff', borderRadius: 12, padding: 16, border: '1px solid var(--gm)', borderTop: `3px solid ${borderColor}`, boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
      <div style={{ fontSize: 11, color: 'var(--txm)', marginBottom: 8, fontWeight: 500 }}>{title} ({total})</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {rows.map(row => (
          <Link key={row.key} href={row.href} style={{ textDecoration: 'none', display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
            <span style={{ color: 'var(--txm)' }}>{row.label}</span>
            <span style={{ fontWeight: 700, color: row.color }}>{row.count}</span>
          </Link>
        ))}
      </div>
    </div>
  )
}
