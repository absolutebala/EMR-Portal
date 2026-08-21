'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import NotificationBell from './NotificationBell'
import { getMyPermissions } from '@/app/actions/roles-actions'

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
  const router = useRouter()
  const containerRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  // Head of Service gets access via a hardcoded role bypass on the page itself
  // (same convention as Attendance — Approve), not via the permissions table.
  const roleBypass = userRole === 'Super Admin' || userRole === 'Head of Service'
  const [canViewAnalytics, setCanViewAnalytics] = useState(false)

  useEffect(() => {
    if (roleBypass) return
    getMyPermissions().then(({ permissions }) => {
      if (permissions['User Analytics — View'] === true) setCanViewAnalytics(true)
    })
  }, [roleBypass])

  useEffect(() => {
    if (!open) return
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  return (
    <div style={{ height: 56, background: '#fff', borderBottom: '1px solid var(--gm)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', position: 'sticky', top: 0, zIndex: 50 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--tx)', whiteSpace: 'nowrap' }}>{title}</div>
        {subtitle && <div style={{ fontSize: 12, color: 'var(--txm)', fontWeight: 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{subtitle}</div>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <NotificationBell />

        {/* User chip */}
        <div ref={containerRef} style={{ position: 'relative' }}>
          <div
            onClick={() => setOpen(o => !o)}
            style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '4px 8px', borderRadius: 8 }}
            onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = 'var(--gl)'}
            onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = 'transparent'}
          >
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--m)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, color: '#fff' }}>
              {getInitials(userName)}
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 500 }}>{userName}</div>
              <div style={{ fontSize: 10, color: 'var(--txm)' }}>{userRole}</div>
            </div>
          </div>

          {open && (roleBypass || canViewAnalytics) && (
            <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, minWidth: 180, background: '#fff', borderRadius: 10, boxShadow: '0 8px 30px rgba(0,0,0,.2)', border: '1px solid var(--gm)', overflow: 'hidden', zIndex: 200 }}>
              <div
                onClick={() => { setOpen(false); router.push('/user-analytics') }}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', fontSize: 12, color: 'var(--tx)', cursor: 'pointer' }}
                onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = 'var(--gl)'}
                onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = ''}
              >
                <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M18 20V10M12 20V4M6 20v-6"/></svg>
                User Analytics
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
