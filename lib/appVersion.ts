// Shown on the login screens (web + PWA) and the bottom of PWA screens so users can
// see which build they're on. Bump these on each release — keep BUILD_NUMBER in step
// with the native app's Android versionCode so the two read consistently.
export const APP_VERSION = '1.0.1'
export const APP_BUILD_NUMBER = 25
export const APP_RELEASE_DATE = '2026-09-05'

// e.g. "Build 25 · v1.0.1 · 05 Sep 2026" — build number first, matching the native app.
export function appVersionLabel(): string {
  const d = new Date(`${APP_RELEASE_DATE}T00:00:00`)
  const date = isNaN(d.getTime())
    ? APP_RELEASE_DATE
    : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  return `Build ${APP_BUILD_NUMBER} · v${APP_VERSION} · ${date}`
}
