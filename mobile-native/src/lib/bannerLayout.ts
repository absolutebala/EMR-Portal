import { Platform } from 'react-native';
import { usePathname } from 'expo-router';
import { usePendingSyncCount } from './pendingSync';
import { useCheckinDriftNotice } from './hooks';

// The five tab-root screens render their own in-JSX header (no native stack header —
// see (tabs)/_layout.tsx's headerShown: false) — every other screen under (app) sets
// headerShown: true on its own Stack.Screen (department-jobs, work-orders/[id],
// alerts, profile, etc.), which puts a real native header — including the back
// button — right where the floating banners below used to land.
const TAB_ROOT_PATHS = new Set(['/dashboard', '/jobs', '/attendance', '/requests', '/expenses']);

// react-navigation's native-stack header content height (the safe-area inset itself
// is handled separately, by insets.top, wherever this is added) — 44 on iOS, 56
// (Material default) on Android.
const NATIVE_HEADER_HEIGHT = Platform.OS === 'ios' ? 44 : 56;

// Extra vertical offset so the floating banners sit below a screen's native header
// (and its back button) instead of drawing on top of it — 0 on the five tab roots,
// which have no native header to avoid.
export function useNativeHeaderOffset(): number {
  const pathname = usePathname();
  return TAB_ROOT_PATHS.has(pathname) ? 0 : NATIVE_HEADER_HEIGHT;
}

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
