import * as Application from 'expo-application';
import Constants from 'expo-constants';

// Fallback release date if the build-time value isn't present (e.g. Expo Go dev). The
// real value comes from app.config.js's extra.buildDate, captured automatically at
// `eas build` time — so the footer date can't drift out of sync with the build again.
const RELEASE_DATE_FALLBACK = '2026-09-11';

function releaseDate(): string {
  const extra = Constants.expoConfig?.extra as { buildDate?: string } | undefined;
  return extra?.buildDate || RELEASE_DATE_FALLBACK;
}

function formatReleaseDate(): string {
  const raw = releaseDate();
  const d = new Date(`${raw}T00:00:00`);
  return isNaN(d.getTime()) ? raw : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

// e.g. "Build 34 · v1.0.1 · 11 Sep 2026" — build number (Android versionCode) first,
// since that's the value that increments every release.
export function appVersionLabel(): string {
  const v = Application.nativeApplicationVersion ?? '—';
  const build = Application.nativeBuildVersion ? `Build ${Application.nativeBuildVersion} · ` : '';
  return `${build}v${v} · ${formatReleaseDate()}`;
}
