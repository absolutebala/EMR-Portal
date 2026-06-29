'use client'

interface TopbarProps {
  title: string
  userName: string
  userRole: string
}

function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

export default function Topbar({ title, userName, userRole }: TopbarProps) {
  return (
    <div style={{ height: 56, background: '#fff', borderBottom: '1px solid var(--gm)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', position: 'sticky', top: 0, zIndex: 50 }}>
      <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--tx)' }}>{title}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {/* Notification bell */}
        <div style={{ width: 36, height: 36, borderRadius: 8, border: '1px solid var(--gm)', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', position: 'relative' }}>
          <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0"/></svg>
          <div style={{ position: 'absolute', top: 8, right: 8, width: 7, height: 7, background: 'var(--m)', borderRadius: '50%', border: '1.5px solid #fff' }}/>
        </div>

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
