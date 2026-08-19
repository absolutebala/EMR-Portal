import { safeSetItem } from './offlineStorage'

export type CheckInSyncStatus = { status: 'pending' } | { status: 'error'; message: string }

interface CheckInPayload {
  workOrderId: string
  latitude: number | null
  longitude: number | null
  placeName: string | null
  photoBase64: string
  mimeType: string
  ext: string
}

const keyFor = (workOrderId: string) => `emr-checkin-sync:${workOrderId}`
const payloadKeyFor = (workOrderId: string) => `emr-checkin-payload:${workOrderId}`
const pendingKey = 'emr-pending-checkins'

export function getCheckInSyncStatus(workOrderId: string): CheckInSyncStatus | null {
  const raw = localStorage.getItem(keyFor(workOrderId))
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function clearCheckInSyncStatus(workOrderId: string) {
  localStorage.removeItem(keyFor(workOrderId))
  localStorage.removeItem(payloadKeyFor(workOrderId))
}

function notify(workOrderId: string) {
  window.dispatchEvent(new CustomEvent('emr-checkin-sync', { detail: { workOrderId } }))
}

async function submitCheckInRequest(payload: CheckInPayload): Promise<{ error: string | null }> {
  const res = await fetch('/api/mobile/submit-checkin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) return { error: data.error || 'Check-in failed — please retry' }
  return { error: null }
}

function queueForAutoRetry(payload: CheckInPayload) {
  const raw = localStorage.getItem(pendingKey)
  const pending: (CheckInPayload & { timestamp: number })[] = raw ? JSON.parse(raw) : []
  pending.push({ ...payload, timestamp: Date.now() })
  safeSetItem(pendingKey, JSON.stringify(pending))

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready.then(reg => {
      if ('sync' in reg) {
        (reg as ServiceWorkerRegistration & { sync: { register: (tag: string) => Promise<void> } })
          .sync.register('sync-checkin-submissions').catch(() => {})
      }
    }).catch(() => {})
  }
}

// Fires the check-in request without blocking navigation. The caller moves on to the
// job detail hub immediately; this keeps running in the same tab and updates a
// localStorage marker (+ a window event for any mounted listener) when it settles, so
// the hub can show "syncing" and pick up the result whenever it lands.
//
// Unlike a plain fire-and-forget attempt, a genuine connectivity failure (offline at
// call time, or the fetch itself throwing mid-flight) queues the already-captured
// GPS + photo for automatic retry once the connection returns — the same "online" event
// + background-sync pattern FormFillView.tsx uses for form submissions, via the same
// stable REST endpoint (not a Server Action, whose action ID changes every deploy and
// can't be relied on from a background sync that may fire well after this page loaded).
// A real server-side rejection (e.g. "flagged for reassignment") is NOT queued for
// auto-retry — retrying a definite rejection forever is pointless — but the payload
// stays cached so retryCheckIn() can resubmit it instantly without recapturing GPS/photo.
export function startBackgroundCheckIn(params: CheckInPayload) {
  safeSetItem(payloadKeyFor(params.workOrderId), JSON.stringify(params))
  safeSetItem(keyFor(params.workOrderId), JSON.stringify({ status: 'pending' }))
  notify(params.workOrderId)

  if (!navigator.onLine) {
    queueForAutoRetry(params)
    notify(params.workOrderId)
    return
  }

  submitCheckInRequest(params).then(
    ({ error }) => {
      if (error) {
        safeSetItem(keyFor(params.workOrderId), JSON.stringify({ status: 'error', message: error }))
      } else {
        clearCheckInSyncStatus(params.workOrderId)
      }
      notify(params.workOrderId)
    },
    () => {
      // fetch() itself threw — a flaky/dropped connection despite navigator.onLine
      // having said otherwise. Queue it the same as the offline case above.
      queueForAutoRetry(params)
      notify(params.workOrderId)
    }
  )
}

// Re-attempts a check-in from its cached payload — used by the "Retry check-in" button
// so a server-side rejection doesn't force the engineer to redo GPS + photo capture.
export function retryCheckIn(workOrderId: string): boolean {
  const raw = localStorage.getItem(payloadKeyFor(workOrderId))
  if (!raw) return false
  try {
    startBackgroundCheckIn(JSON.parse(raw))
    return true
  } catch {
    return false
  }
}

// Processes the auto-retry queue — called on the browser's "online" event and from the
// service worker's background-sync message, mirroring FormFillView.tsx's syncPending().
export async function syncPendingCheckins() {
  const raw = localStorage.getItem(pendingKey)
  if (!raw) return
  const pending: (CheckInPayload & { timestamp: number })[] = JSON.parse(raw)
  if (!pending.length) return

  const remaining: typeof pending = []
  for (const item of pending) {
    try {
      const { error } = await submitCheckInRequest(item)
      if (error) {
        remaining.push(item)
      } else {
        clearCheckInSyncStatus(item.workOrderId)
      }
    } catch {
      remaining.push(item)
    }
    notify(item.workOrderId)
  }
  safeSetItem(pendingKey, JSON.stringify(remaining))
}
