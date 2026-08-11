import NetInfo from '@react-native-community/netinfo';
import { ApiError } from './api';

// A paused (offline) react-query mutation's mutateAsync() promise simply doesn't
// resolve or reject until it runs — it does NOT throw. Relying on a try/catch around
// mutateAsync() to detect "we're offline" is a real bug: it never fires for a
// genuinely paused mutation, and misroutes a real server-side validation error (which
// DOES throw, as an ApiError) into "saved offline" messaging instead of showing the
// actual problem. Check connectivity explicitly first instead, matching the PWA's
// navigator.onLine pre-check pattern.
export async function isOnline(): Promise<boolean> {
  const state = await NetInfo.fetch();
  return !!state.isConnected && state.isInternetReachable !== false;
}

export function apiErrorMessage(e: unknown, fallback = 'Network error. Please try again.'): string {
  return e instanceof ApiError ? e.message : fallback;
}
