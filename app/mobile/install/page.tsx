'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export default function MobileInstallPage() {
  const router = useRouter()
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [isIOS, setIsIOS] = useState(false)
  const [installing, setInstalling] = useState(false)

  useEffect(() => {
    // Already running as the installed app (or launched from its icon) — nothing to
    // install, skip straight in. /mobile itself routes on to dashboard or login.
    const standalone = window.matchMedia('(display-mode: standalone)').matches
      || (window.navigator as unknown as { standalone?: boolean }).standalone === true
    if (standalone) { router.replace('/mobile'); return }

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsIOS(/iphone|ipad|ipod/i.test(navigator.userAgent))

    function handleBeforeInstallPrompt(e: Event) {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
  }, [router])

  async function handleInstall() {
    if (!deferredPrompt) return
    setInstalling(true)
    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    setInstalling(false)
    setDeferredPrompt(null)
    if (outcome === 'accepted') router.replace('/mobile')
  }

  return (
    <div style={{
      minHeight: '100dvh',
      display: 'flex',
      flexDirection: 'column',
      background: 'linear-gradient(160deg, #3A0A1C 0%, #7D1D3F 60%, #A8294F 100%)',
      padding: '0 24px',
    }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', paddingBottom: 32 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            background: '#fff',
            borderRadius: 20,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px',
            padding: '16px 22px',
            boxShadow: '0 10px 30px rgba(0,0,0,0.2)',
          }}>
            <img src="/emr-logo.png" alt="EMR" style={{ height: 38, width: 'auto', display: 'block' }} />
          </div>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: '#fff', margin: 0, letterSpacing: '-0.3px' }}>Field</h1>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', marginTop: 4, fontWeight: 300 }}>Field Engineer App</p>
        </div>

        <div style={{ background: '#fff', borderRadius: 20, padding: 28, boxShadow: '0 20px 60px rgba(0,0,0,0.35)' }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: '#1C0D14', margin: '0 0 4px' }}>Install the app</h2>
          <p style={{ fontSize: 12, color: '#7A6870', marginBottom: 22, lineHeight: 1.6 }}>
            Add EMR Field to your home screen for faster loading, offline access, and a real app icon — no app store needed.
          </p>

          {deferredPrompt ? (
            <button
              onClick={handleInstall}
              disabled={installing}
              style={{
                width: '100%', padding: '14px',
                background: installing ? '#A8294F' : '#7D1D3F',
                color: '#fff', border: 'none', borderRadius: 12,
                fontSize: 15, fontWeight: 600,
                cursor: installing ? 'not-allowed' : 'pointer',
                fontFamily: 'Poppins, sans-serif',
                marginBottom: 16,
              }}
            >
              {installing ? 'Installing…' : 'Install app'}
            </button>
          ) : isIOS ? (
            <div style={{ background: '#F9EEF2', border: '1px solid #E8C5D0', borderRadius: 12, padding: '14px 16px', marginBottom: 16 }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: '#7D1D3F', margin: '0 0 8px' }}>To install on iPhone/iPad:</p>
              <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: '#374151', lineHeight: 1.9 }}>
                <li>Tap the <strong>Share</strong> button in Safari&apos;s toolbar</li>
                <li>Scroll down and tap <strong>Add to Home Screen</strong></li>
                <li>Tap <strong>Add</strong> in the top right</li>
              </ol>
            </div>
          ) : (
            <div style={{ background: '#F9EEF2', border: '1px solid #E8C5D0', borderRadius: 12, padding: '14px 16px', marginBottom: 16 }}>
              <p style={{ fontSize: 12, color: '#374151', margin: 0, lineHeight: 1.6 }}>
                Open your browser menu and look for <strong>Add to Home Screen</strong> or <strong>Install app</strong>.
              </p>
            </div>
          )}

          <button
            onClick={() => router.push('/mobile')}
            style={{
              width: '100%', padding: '13px',
              background: 'none', border: 'none',
              color: '#7A6870', fontSize: 13, fontWeight: 500,
              cursor: 'pointer', fontFamily: 'Poppins, sans-serif',
            }}
          >
            Continue without installing
          </button>
        </div>
      </div>

      <div style={{ textAlign: 'center', paddingBottom: 24, fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>
        EMR Global · Field Service Management
      </div>
    </div>
  )
}
