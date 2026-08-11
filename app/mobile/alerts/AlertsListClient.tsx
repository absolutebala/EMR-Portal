'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import MobileHeader from '@/components/mobile/MobileHeader'
import { markNotificationRead, markAllNotificationsRead } from '@/app/actions/notifications'
import type { NotificationView } from '@/lib/mobile/core/notifications'

interface Props {
  notifications: NotificationView[]
  error: string | null
}

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

export default function AlertsListClient({ notifications: initial, error }: Props) {
  const router = useRouter()
  const [notifications, setNotifications] = useState(initial)
  const unreadCount = notifications.filter(n => !n.read).length

  async function handleSelect(n: NotificationView) {
    if (!n.read) {
      setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, read: true } : x))
      markNotificationRead(n.id).catch(() => {})
    }
    if (n.linkPath) router.push(n.linkPath)
  }

  async function handleMarkAllRead() {
    setNotifications(prev => prev.map(x => ({ ...x, read: true })))
    markAllNotificationsRead().catch(() => {})
  }

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', background: '#F8F5F6' }}>
      <MobileHeader
        title="Alerts"
        backHref="/mobile/dashboard"
        rightSlot={unreadCount > 0 ? (
          <button
            className="mtap"
            onClick={handleMarkAllRead}
            style={{ background: 'rgba(255,255,255,0.12)', border: 'none', borderRadius: 8, padding: '7px 12px', fontSize: 11, color: '#fff', cursor: 'pointer', fontFamily: 'Poppins, sans-serif', fontWeight: 500 }}
          >
            Mark all read
          </button>
        ) : null}
      />

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
        {error && (
          <div style={{ background: '#FEE2E2', color: '#DC2626', borderRadius: 10, padding: '12px 14px', fontSize: 13, marginBottom: 16 }}>
            {error}
          </div>
        )}

        {notifications.length === 0 && !error && (
          <div style={{ background: '#fff', borderRadius: 16, padding: '32px 24px', textAlign: 'center', border: '1px solid #E5E0E3' }}>
            <div style={{ fontSize: 12, color: '#7A6870' }}>No alerts yet.</div>
          </div>
        )}

        {notifications.map(n => (
          <div
            key={n.id}
            className="mtap"
            onClick={() => handleSelect(n)}
            style={{
              background: n.read ? '#fff' : '#F9EEF2', borderRadius: 12, padding: 13, marginBottom: 10,
              boxShadow: '0 1px 4px rgba(125,29,63,0.05)', cursor: 'pointer', display: 'flex', gap: 8, alignItems: 'flex-start',
            }}
          >
            {!n.read && <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#7D1D3F', flexShrink: 0, marginTop: 5 }} />}
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: n.read ? 500 : 600, color: '#1C0D14' }}>{n.title}</div>
              {n.body && <div style={{ fontSize: 11, color: '#7A6870', marginTop: 3 }}>{n.body}</div>}
              <div style={{ fontSize: 10, color: '#7A6870', marginTop: 4 }}>{relativeTime(n.createdAt)}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
