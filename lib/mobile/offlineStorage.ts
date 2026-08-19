// Shared safety net for the offline-queue localStorage writes in FormFillView.tsx,
// backgroundCheckIn.ts, and backgroundClosure.ts — each queued entry can carry a
// base64 photo or signature, so a long stretch offline across several jobs can push
// localStorage (a small ~5-10MB per-origin quota on mobile browsers) toward its limit.
// On a genuine quota failure, prune queued items older than 10 days — by then the
// job has almost certainly moved on and they're not worth holding onto — and retry
// once before giving up.

const PENDING_QUEUE_KEYS = ['emr-pending-submissions', 'emr-pending-checkins', 'emr-pending-closures']
const MAX_AGE_MS = 10 * 24 * 60 * 60 * 1000

function isQuotaExceeded(e: unknown): boolean {
  return e instanceof DOMException && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED')
}

function pruneOldPendingEntries() {
  for (const key of PENDING_QUEUE_KEYS) {
    const raw = localStorage.getItem(key)
    if (!raw) continue
    try {
      const items: { timestamp?: number }[] = JSON.parse(raw)
      const cutoff = Date.now() - MAX_AGE_MS
      const kept = items.filter(item => (item.timestamp ?? 0) >= cutoff)
      if (kept.length !== items.length) localStorage.setItem(key, JSON.stringify(kept))
    } catch {
      // Corrupt queue entry — drop it rather than leave dead weight taking up quota.
      localStorage.removeItem(key)
    }
  }
}

// Best-effort localStorage write: on a quota failure, frees space by dropping
// offline-queue entries older than 10 days and retries once. Returns false (and logs)
// if the write still can't be made to fit — callers already treat storage as
// best-effort (e.g. a failed draft autosave just means the next successful save wins).
export function safeSetItem(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value)
    return true
  } catch (e) {
    if (!isQuotaExceeded(e)) { console.error('safeSetItem failed:', e); return false }
    pruneOldPendingEntries()
    try {
      localStorage.setItem(key, value)
      return true
    } catch (e2) {
      console.error('safeSetItem: still over quota after pruning entries older than 10 days:', e2)
      return false
    }
  }
}
