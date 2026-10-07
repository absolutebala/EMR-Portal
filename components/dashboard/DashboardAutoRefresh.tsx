'use client'

import { useRouter } from 'next/navigation'
import { useAutoRefresh } from '@/lib/useAutoRefresh'

// The dashboard is a server component, so there's no client polling by default. This
// tiny client child re-runs the server render (router.refresh re-fetches the data
// without a full page reload or losing scroll position) every interval AND on return to
// the tab, so the latest notifications, engineer status and KPIs appear without a manual
// refresh — matching the mobile app's 45s auto-refresh.
export default function DashboardAutoRefresh({ intervalMs = 45000 }: { intervalMs?: number }) {
  const router = useRouter()
  useAutoRefresh(() => router.refresh(), intervalMs)
  return null
}
