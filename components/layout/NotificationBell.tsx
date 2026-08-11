'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getMyNotifications, markNotificationRead, markAllNotificationsRead } from '@/app/actions/notifications'
import type { NotificationView } from '@/lib/mobile/core/notifications'

const POLL_MS = 30000

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

export default function NotificationBell() {
  const router = useRouter()
  const containerRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState<NotificationView[]>([])
  const [unreadCount, setUnreadCount] = useState(0)

  async function refresh() {
    const { notifications: rows, unreadCount: count } = await getMyNotifications(10)
    setNotifications(rows)
    setUnreadCount(count)
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh()
    const interval = setInterval(refresh, POLL_MS)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (!open) return
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  async function handleSelect(n: NotificationView) {
    if (!n.read) {
      setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, read: true } : x))
      setUnreadCount(c => Math.max(0, c - 1))
      markNotificationRead(n.id).catch(() => {})
    }
    setOpen(false)
    if (n.linkPath) router.push(n.linkPath)
  }

  async function handleMarkAllRead() {
    setNotifications(prev => prev.map(x => ({ ...x, read: true })))
    setUnreadCount(0)
    markAllNotificationsRead().catch(() => {})
  }

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <div
        onClick={() => setOpen(o => !o)}
        style={{ width: 36, height: 36, borderRadius: 8, border: '1px solid var(--gm)', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', position: 'relative' }}
      >
        <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0"/></svg>
        {unreadCount > 0 && (
          <div style={{ position: 'absolute', top: 5, right: 5, minWidth: 14, height: 14, padding: '0 2px', background: 'var(--m)', borderRadius: 7, border: '1.5px solid #fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 700, color: '#fff' }}>
            {unreadCount > 9 ? '9+' : unreadCount}
          </div>
        )}
      </div>

      {open && (
        <div style={{
          position: 'absolute', top: 44, right: 0, width: 340, maxHeight: 420, overflowY: 'auto',
          background: '#fff', border: '1px solid var(--gm)', borderRadius: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 60,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid var(--gm)' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--tx)' }}>Alerts</div>
            {unreadCount > 0 && (
              <button onClick={handleMarkAllRead} style={{ background: 'none', border: 'none', fontSize: 11, color: 'var(--m)', fontWeight: 500, cursor: 'pointer' }}>
                Mark all read
              </button>
            )}
          </div>

          {notifications.length === 0 ? (
            <div style={{ padding: '32px 16px', textAlign: 'center', fontSize: 12, color: 'var(--txm)' }}>No alerts yet</div>
          ) : (
            notifications.map(n => (
              <div
                key={n.id}
                onClick={() => handleSelect(n)}
                style={{
                  padding: '10px 14px', borderBottom: '1px solid var(--gm)', cursor: 'pointer',
                  background: n.read ? '#fff' : '#F9EEF2', display: 'flex', gap: 8, alignItems: 'flex-start',
                }}
              >
                {!n.read && <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--m)', flexShrink: 0, marginTop: 5 }} />}
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: n.read ? 500 : 600, color: 'var(--tx)' }}>{n.title}</div>
                  {n.body && <div style={{ fontSize: 11, color: 'var(--txm)', marginTop: 2 }}>{n.body}</div>}
                  <div style={{ fontSize: 10, color: 'var(--txm)', marginTop: 3 }}>{relativeTime(n.createdAt)}</div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
