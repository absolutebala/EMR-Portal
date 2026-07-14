import { submitCheckIn } from '@/app/actions/mobile-actions'

export type CheckInSyncStatus = { status: 'pending' } | { status: 'error'; message: string }

const keyFor = (workOrderId: string) => `emr-checkin-sync:${workOrderId}`

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
}

function notify(workOrderId: string) {
  window.dispatchEvent(new CustomEvent('emr-checkin-sync', { detail: { workOrderId } }))
}

// Fires the check-in request without blocking navigation. The caller moves on to the
// job detail hub immediately; this keeps running in the same tab and updates a
// localStorage marker (+ a window event for any mounted listener) when it settles,
// so the hub can show "syncing" and pick up the result whenever it lands.
export function startBackgroundCheckIn(params: {
  workOrderId: string
  latitude: number | null
  longitude: number | null
  placeName: string | null
  photoBase64: string
  mimeType: string
  ext: string
}) {
  localStorage.setItem(keyFor(params.workOrderId), JSON.stringify({ status: 'pending' }))
  notify(params.workOrderId)

  submitCheckIn(params).then(
    ({ error }) => {
      if (error) {
        localStorage.setItem(keyFor(params.workOrderId), JSON.stringify({ status: 'error', message: error }))
      } else {
        clearCheckInSyncStatus(params.workOrderId)
      }
      notify(params.workOrderId)
    },
    (e: unknown) => {
      const message = e instanceof Error ? e.message : 'Check-in failed — please retry'
      localStorage.setItem(keyFor(params.workOrderId), JSON.stringify({ status: 'error', message }))
      notify(params.workOrderId)
    }
  )
}
