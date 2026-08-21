'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getMyProfile } from '@/app/actions/update-my-profile'
import { logout } from '@/app/actions/logout'

function initials(firstName: string, lastName: string): string {
  return ((firstName[0] || '') + (lastName[0] || '')).toUpperCase() || '?'
}

// Replaces the old plain-text "Sign out" link — tapping the avatar opens a small
// anchored menu (Profile / Change Password / Logout) instead of signing out
// directly, mirroring the RN native app's AccountMenu (mobile-native/src/components/AccountMenu.tsx).
export default function AccountMenu() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [profile, setProfile] = useState<{ firstName: string; lastName: string; avatarUrl: string | null } | null>(null)

  useEffect(() => {
    getMyProfile().then(({ profile: p }) => { if (p) setProfile(p) })
  }, [])

  function go(path: string) {
    setOpen(false)
    router.push(path)
  }

  async function handleLogout() {
    setOpen(false)
    await logout()
    window.location.href = '/mobile/login'
  }

  return (
    <div style={{ position: 'relative' }}>
      <button
        className="mtap"
        onClick={() => setOpen(o => !o)}
        style={{
          width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,0.15)',
          border: '1.5px solid rgba(255,255,255,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', overflow: 'hidden', padding: 0, flexShrink: 0,
        }}
      >
        {profile?.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={profile.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <span style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>
            {profile ? initials(profile.firstName, profile.lastName) : ''}
          </span>
        )}
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 20 }} />
          <div style={{
            position: 'absolute', top: 40, right: 0, zIndex: 21, minWidth: 180,
            background: '#fff', borderRadius: 12, padding: '4px 0',
            boxShadow: '0 4px 20px rgba(0,0,0,0.18)',
          }}>
            <button className="mtap" onClick={() => go('/mobile/profile')} style={menuItemStyle}>Profile</button>
            <div style={dividerStyle} />
            <button className="mtap" onClick={() => go('/mobile/my-analytics')} style={menuItemStyle}>My Analytics</button>
            <div style={dividerStyle} />
            <button className="mtap" onClick={() => go('/mobile/account-password')} style={menuItemStyle}>Change Password</button>
            <div style={dividerStyle} />
            <button className="mtap" onClick={handleLogout} style={{ ...menuItemStyle, color: '#DC2626' }}>Logout</button>
          </div>
        </>
      )}
    </div>
  )
}

const menuItemStyle: React.CSSProperties = {
  display: 'block', width: '100%', textAlign: 'left', padding: '12px 16px',
  fontSize: 13, fontWeight: 600, color: '#1C0D14', background: 'none', border: 'none',
  cursor: 'pointer', fontFamily: 'Poppins, sans-serif',
}

const dividerStyle: React.CSSProperties = { height: 1, background: '#F5F3F5', margin: '0 8px' }
