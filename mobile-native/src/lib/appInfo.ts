import * as Application from 'expo-application';

// Human-readable release date shown next to the version. Bump this on each store
// release so engineers can see at a glance how current their build is.
export const RELEASE_DATE = '2026-09-05';

function formatReleaseDate(): string {
  const d = new Date(`${RELEASE_DATE}T00:00:00`);
  return isNaN(d.getTime()) ? RELEASE_DATE : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

// e.g. "App version 1.0.1 (24) · 05 Sep 2026"
export function appVersionLabel(): string {
  const v = Application.nativeApplicationVersion ?? '—';
  const b = Application.nativeBuildVersion ? ` (${Application.nativeBuildVersion})` : '';
  return `App version ${v}${b} · ${formatReleaseDate()}`;
}
