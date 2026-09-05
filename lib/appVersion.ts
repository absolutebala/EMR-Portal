// Shown on the login screens (web + PWA) and the bottom of PWA screens so users can
// see which build they're on. Bump both on each release.
export const APP_VERSION = '1.0.1'
export const APP_RELEASE_DATE = '2026-09-05'

// e.g. "Version 1.0.1 · 05 Sep 2026"
export function appVersionLabel(): string {
  const d = new Date(`${APP_RELEASE_DATE}T00:00:00`)
  const date = isNaN(d.getTime())
    ? APP_RELEASE_DATE
    : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  return `Version ${APP_VERSION} · ${date}`
}
