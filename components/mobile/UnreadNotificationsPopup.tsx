'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getMyNotifications } from '@/app/actions/notifications'
import type { NotificationView } from '@/lib/mobile/core/notifications'

const MAX_LISTED = 5
// Local-only "have I already popped this one up" tracking, separate from the server's
// read state (which only flips once the engineer opens the alerts list) — stops the
// same unread notifications re-triggering the popup on every open. Capped so it can't
// grow unbounded.
const SHOWN_IDS_KEY = 'emr_popup_shown_notification_ids'
const MAX_TRACKED_IDS = 300

function loadShownIds(): Set<string> {
  try {
    const raw = localStorage.getItem(SHOWN_IDS_KEY)
    return new Set(raw ? (JSON.parse(raw) as string[]) : [])
  } catch { return new Set() }
}

function markShown(ids: string[], alreadyShown: Set<string>) {
  const merged = [...alreadyShown, ...ids]
  const trimmed = merged.slice(Math.max(0, merged.length - MAX_TRACKED_IDS))
  try { localStorage.setItem(SHOWN_IDS_KEY, JSON.stringify(trimmed)) } catch {}
}

// PWA counterpart of the native app's UnreadNotificationsPopup. Built on the in-app
// notifications list (not push delivery), so it surfaces new job assignments even when
// web push is missed. Shows only notifications not already popped before; re-checks
// when the tab is brought back to the foreground.
export default function UnreadNotificationsPopup() {
  const router = useRouter()
  const [visible, setVisible] = useState(false)
  const [items, setItems] = useState<NotificationView[]>([])
  const checking = useRef(false)

  const checkForUnread = useCallback(async () => {
    if (checking.current) return
    checking.current = true
    try {
      const { notifications } = await getMyNotifications(20)
      const shownIds = loadShownIds()
      const unseen = (notifications ?? []).filter(n => !n.read && !shownIds.has(n.id))
      if (unseen.length > 0) {
        setItems(unseen)
        setVisible(true)
        markShown(unseen.map(n => n.id), shownIds)
      }
    } catch {
      // best-effort
    } finally {
      checking.current = false
    }
  }, [])

  useEffect(() => {
    // checkForUnread only setState()s after an await (it's async), so this isn't a
    // synchronous-in-effect update despite the lint heuristic flagging the call site.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    checkForUnread()
    const onVisible = () => { if (document.visibilityState === 'visible') checkForUnread() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [checkForUnread])

  function openItem(n: NotificationView) {
    setVisible(false)
    if (n.linkPath) router.push(n.linkPath)
  }

  if (!visible) return null
  const extraCount = Math.max(0, items.length - MAX_LISTED)

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 360, background: '#fff', borderRadius: 16, padding: 20, fontFamily: 'Poppins, sans-serif' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: '#1C0D14', margin: 0 }}>
            {items.length} new notification{items.length !== 1 ? 's' : ''}
          </h3>
          <button className="mtap" onClick={() => setVisible(false)} aria-label="Close" style={{ background: 'none', border: 'none', fontSize: 16, color: '#9CA3AF', fontWeight: 600, cursor: 'pointer', padding: 4 }}>✕</button>
        </div>
        <p style={{ fontSize: 11, color: '#9CA3AF', margin: '2px 0 8px' }}>Tap a notification to open it.</p>
        <div>
          {items.slice(0, MAX_LISTED).map(n => (
            <button key={n.id} className="mtap" onClick={() => openItem(n)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', padding: '11px 0', borderTop: '1px solid #F5F3F5', background: 'none', border: 'none', borderTopStyle: 'solid', cursor: 'pointer', fontFamily: 'Poppins, sans-serif' }}>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#1C0D14', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.title}</span>
                {!!n.body && <span style={{ display: 'block', fontSize: 12, color: '#7A6870', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.body}</span>}
              </span>
              <span style={{ fontSize: 20, color: '#B9A9B0' }}>›</span>
            </button>
          ))}
          {extraCount > 0 && (
            <button className="mtap" onClick={() => { setVisible(false); router.push('/mobile/alerts') }}
              style={{ background: 'none', border: 'none', color: '#7D1D3F', fontSize: 12, fontWeight: 600, marginTop: 10, cursor: 'pointer', fontFamily: 'Poppins, sans-serif', padding: 0 }}>
              and {extraCount} more — view all →
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
