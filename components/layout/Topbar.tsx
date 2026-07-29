'use client'

import NotificationBell from './NotificationBell'

interface TopbarProps {
  title: string
  subtitle?: string
  userName: string
  userRole: string
}

function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

export default function Topbar({ title, subtitle, userName, userRole }: TopbarProps) {
  return (
    <div style={{ height: 56, background: '#fff', borderBottom: '1px solid var(--gm)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', position: 'sticky', top: 0, zIndex: 50 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--tx)', whiteSpace: 'nowrap' }}>{title}</div>
        {subtitle && <div style={{ fontSize: 12, color: 'var(--txm)', fontWeight: 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{subtitle}</div>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <NotificationBell />

        {/* User chip */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '4px 8px', borderRadius: 8 }}>
          <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--m)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, color: '#fff' }}>
            {getInitials(userName)}
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 500 }}>{userName}</div>
            <div style={{ fontSize: 10, color: 'var(--txm)' }}>{userRole}</div>
          </div>
        </div>
      </div>
    </div>
  )
}
