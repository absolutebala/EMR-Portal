'use client'

import { useEffect, useState } from 'react'
import type { AppUpdatePrompt } from '@/lib/mobile/core/dashboard'

// Tracks the promptAt of the last prompt the user dismissed, so a given prompt only
// shows until they act — but a newer prompt (later promptAt) re-shows.
const DISMISSED_KEY = 'emr_dismissed_update_prompt_at'

// PWA counterpart of the native app's AppUpdatePopup. The admin sets a message + link
// and pushes a prompt from Settings; the dashboard payload carries updatePrompt and
// this shows the in-app popup. On the PWA, "update" means reloading to the latest
// deployed version, so if no external link is set it just hard-reloads the app.
export default function AppUpdatePopup({ prompt }: { prompt: AppUpdatePrompt | null }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    let show = false
    if (prompt) {
      let dismissedAt: string | null = null
      try { dismissedAt = localStorage.getItem(DISMISSED_KEY) } catch {}
      show = !dismissedAt || dismissedAt < prompt.promptAt
    }
    // Derived from a client-only localStorage read (can't run during render without a
    // hydration mismatch), so setting state here in the effect is intended.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVisible(show)
  }, [prompt])

  if (!prompt || !visible) return null

  function dismiss() {
    try { if (prompt) localStorage.setItem(DISMISSED_KEY, prompt.promptAt) } catch {}
    setVisible(false)
  }

  function handleUpdate() {
    if (prompt?.playStoreUrl) {
      window.open(prompt.playStoreUrl, '_blank', 'noopener')
    } else {
      // No store link on the PWA — reload to pick up the latest deployed build.
      window.location.reload()
    }
    dismiss()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 360, background: '#fff', borderRadius: 16, padding: 20, fontFamily: 'Poppins, sans-serif' }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: '#1C0D14', margin: '0 0 10px' }}>Update available</h3>
        <p style={{ fontSize: 13, color: '#4A3A42', lineHeight: 1.5, margin: '0 0 18px' }}>{prompt.message}</p>
        <button
          className="mtap"
          onClick={handleUpdate}
          style={{ width: '100%', background: '#7D1D3F', color: '#fff', border: 'none', borderRadius: 10, padding: 12, fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'Poppins, sans-serif' }}
        >
          Okay
        </button>
      </div>
    </div>
  )
}
