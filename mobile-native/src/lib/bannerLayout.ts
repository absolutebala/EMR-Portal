import { usePendingSyncCount } from './pendingSync';
import { useCheckinDriftNotice } from './hooks';

// Fixed-height estimates for the two globally-floating banners (PendingSyncBanner,
// CheckinDriftBanner) — both share the same single-line text + 8px vertical padding
// style, so a shared constant (rather than true onLayout measurement, which would
// need a cross-component shared ref) is close enough and avoids a bigger
// context/provider rework for what's otherwise a small visual offset.
export const PENDING_SYNC_BANNER_HEIGHT = 40;
export const CHECKIN_DRIFT_BANNER_HEIGHT = 40;
const BANNER_GAP = 6;

// How much vertical space is currently occupied by the global floating banners,
// below the safe-area inset — used both by CheckinDriftBanner itself (to sit below
// PendingSyncBanner only when it's actually showing) and by any screen (e.g.
// Dashboard) that needs to reserve matching top padding so its own header never
// renders underneath either banner.
export function useBannerStackHeight(): number {
  const pendingCount = usePendingSyncCount();
  const { data: notice } = useCheckinDriftNotice();
  let height = 0;
  if (pendingCount > 0) height += PENDING_SYNC_BANNER_HEIGHT + BANNER_GAP;
  if (notice) height += CHECKIN_DRIFT_BANNER_HEIGHT + BANNER_GAP;
  return height;
}

// Just the offset contributed by PendingSyncBanner alone (CheckinDriftBanner needs
// this specifically, to sit below it without double-counting its own height).
export function usePendingSyncBannerOffset(): number {
  const pendingCount = usePendingSyncCount();
  return pendingCount > 0 ? PENDING_SYNC_BANNER_HEIGHT + BANNER_GAP : 0;
}
