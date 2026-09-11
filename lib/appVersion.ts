// Shown on the login screens (web + PWA) and the bottom of PWA screens so users can
// see which build they're on. The release DATE is captured automatically at build time
// (NEXT_PUBLIC_BUILD_DATE, injected in next.config.ts) so it can't drift; keep
// APP_BUILD_NUMBER in step with the native app's Android versionCode when you release.
export const APP_VERSION = '1.0.1'
export const APP_BUILD_NUMBER = 34
const RELEASE_DATE_FALLBACK = '2026-09-11'

// e.g. "Build 34 · v1.0.1 · 11 Sep 2026" — build number first, matching the native app.
export function appVersionLabel(): string {
  const raw = process.env.NEXT_PUBLIC_BUILD_DATE || RELEASE_DATE_FALLBACK
  const d = new Date(`${raw}T00:00:00`)
  const date = isNaN(d.getTime())
    ? raw
    : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  return `Build ${APP_BUILD_NUMBER} · v${APP_VERSION} · ${date}`
}
