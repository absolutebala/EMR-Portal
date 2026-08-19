import { safeSetItem } from './offlineStorage'

export type ClosureSyncStatus = { status: 'pending' } | { status: 'error'; message: string }

interface ClosurePayload {
  workOrderId: string
  outcome: 'completed' | 'pending'
  summary: string
  pendingReason: string | null
  materialsRequired: string | null
  revisitDate: string | null
  needsReassignment: boolean
  engineerSignature: string
  clientName: string
  clientSignature: string
  offSite?: boolean
}

const keyFor = (workOrderId: string) => `emr-closure-sync:${workOrderId}`
const payloadKeyFor = (workOrderId: string) => `emr-closure-payload:${workOrderId}`
const pendingKey = 'emr-pending-closures'

export function getClosureSyncStatus(workOrderId: string): ClosureSyncStatus | null {
  const raw = localStorage.getItem(keyFor(workOrderId))
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function clearClosureSyncStatus(workOrderId: string) {
  localStorage.removeItem(keyFor(workOrderId))
  localStorage.removeItem(payloadKeyFor(workOrderId))
}

function notify(workOrderId: string) {
  window.dispatchEvent(new CustomEvent('emr-closure-sync', { detail: { workOrderId } }))
}

async function submitClosureRequest(payload: ClosurePayload): Promise<{ error: string | null }> {
  const res = await fetch('/api/mobile/submit-closure', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) return { error: data.error || 'Closure failed — please retry' }
  return { error: null }
}

function queueForAutoRetry(payload: ClosurePayload) {
  const raw = localStorage.getItem(pendingKey)
  const pending: (ClosurePayload & { timestamp: number })[] = raw ? JSON.parse(raw) : []
  pending.push({ ...payload, timestamp: Date.now() })
  safeSetItem(pendingKey, JSON.stringify(pending))

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready.then(reg => {
      if ('sync' in reg) {
        (reg as ServiceWorkerRegistration & { sync: { register: (tag: string) => Promise<void> } })
          .sync.register('sync-closure-submissions').catch(() => {})
      }
    }).catch(() => {})
  }
}

// Fires the closure request without blocking navigation — same "cache payload, queue
// on real connectivity failure, navigate away immediately" pattern as
// backgroundCheckIn.ts's startBackgroundCheckIn, via the same kind of stable REST
// endpoint (not a Server Action, whose action ID changes every deploy and can't be
// relied on from a background sync that may fire well after this page loaded).
// A real server-side rejection is NOT queued for auto-retry — but the payload stays
// cached so retryClosure() can resubmit it instantly without redoing signatures.
export function startBackgroundClosure(params: ClosurePayload) {
  safeSetItem(payloadKeyFor(params.workOrderId), JSON.stringify(params))
  safeSetItem(keyFor(params.workOrderId), JSON.stringify({ status: 'pending' }))
  notify(params.workOrderId)

  if (!navigator.onLine) {
    queueForAutoRetry(params)
    notify(params.workOrderId)
    return
  }

  submitClosureRequest(params).then(
    ({ error }) => {
      if (error) {
        safeSetItem(keyFor(params.workOrderId), JSON.stringify({ status: 'error', message: error }))
      } else {
        clearClosureSyncStatus(params.workOrderId)
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

// Re-attempts a closure from its cached payload — used by the "didn't sync" banner's
// Retry button so a server-side rejection doesn't force the engineer to redo the
// signatures.
export function retryClosure(workOrderId: string): boolean {
  const raw = localStorage.getItem(payloadKeyFor(workOrderId))
  if (!raw) return false
  try {
    startBackgroundClosure(JSON.parse(raw))
    return true
  } catch {
    return false
  }
}

// Processes the auto-retry queue — called on the browser's "online" event and from the
// service worker's background-sync message, mirroring backgroundCheckIn.ts's
// syncPendingCheckins.
export async function syncPendingClosures() {
  const raw = localStorage.getItem(pendingKey)
  if (!raw) return
  const pending: (ClosurePayload & { timestamp: number })[] = JSON.parse(raw)
  if (!pending.length) return

  const remaining: typeof pending = []
  for (const item of pending) {
    try {
      const { error } = await submitClosureRequest(item)
      if (error) {
        remaining.push(item)
      } else {
        clearClosureSyncStatus(item.workOrderId)
      }
    } catch {
      remaining.push(item)
    }
    notify(item.workOrderId)
  }
  safeSetItem(pendingKey, JSON.stringify(remaining))
}
