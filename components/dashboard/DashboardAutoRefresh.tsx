'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// The dashboard is a server component, so there's no client polling by default. This
// tiny client child re-runs the server render (router.refresh re-fetches the data
// without a full page reload or losing scroll position) on a fixed interval, so the
// latest notifications, engineer status and KPIs appear without a manual refresh —
// matching the mobile app's 45s auto-refresh. Only fires while the tab is visible.
export default function DashboardAutoRefresh({ intervalMs = 45000 }: { intervalMs?: number }) {
  const router = useRouter()
  useEffect(() => {
    const id = setInterval(() => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') router.refresh()
    }, intervalMs)
    return () => clearInterval(id)
  }, [router, intervalMs])
  return null
}
