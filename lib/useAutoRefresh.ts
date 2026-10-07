'use client'

import { useEffect, useRef } from 'react'

// Run `refresh` every intervalMs while the tab is visible, AND immediately whenever the
// tab is brought back to the foreground. Browsers throttle (or pause) timers in
// background tabs, so a page left open while the user worked elsewhere would otherwise
// keep showing stale data until the next — possibly long-delayed — tick or a manual
// reload. Firing on visibilitychange / window focus makes returning to the tab refresh
// at once. The callback is read through a ref so changing it never re-subscribes the
// listeners or restarts the interval.
export function useAutoRefresh(refresh: () => void, intervalMs = 45000) {
  const ref = useRef(refresh)
  ref.current = refresh
  useEffect(() => {
    const run = () => { if (typeof document === 'undefined' || document.visibilityState === 'visible') ref.current() }
    const id = setInterval(run, intervalMs)
    document.addEventListener('visibilitychange', run)
    window.addEventListener('focus', run)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', run)
      window.removeEventListener('focus', run)
    }
  }, [intervalMs])
}
