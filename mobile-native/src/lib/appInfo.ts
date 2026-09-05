import * as Application from 'expo-application';

// Human-readable release date shown next to the version. Bump this on each store
// release so engineers can see at a glance how current their build is.
export const RELEASE_DATE = '2026-09-05';

function formatReleaseDate(): string {
  const d = new Date(`${RELEASE_DATE}T00:00:00`);
  return isNaN(d.getTime()) ? RELEASE_DATE : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

// e.g. "Build 25 · v1.0.1 · 05 Sep 2026" — build number (Android versionCode) first,
// since that's the value that increments every release.
export function appVersionLabel(): string {
  const v = Application.nativeApplicationVersion ?? '—';
  const build = Application.nativeBuildVersion ? `Build ${Application.nativeBuildVersion} · ` : '';
  return `${build}v${v} · ${formatReleaseDate()}`;
}
