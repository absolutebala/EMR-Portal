'use client'

import React, { useState, useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import EditProfileModal from '@/components/users/EditProfileModal'

interface SidebarProps {
  userName: string
  userRole: string
  permissions: Record<string, boolean>
  modules: string[]
  userEmail: string
}

const NAV = [
  { section: 'Main', items: [
    { label: 'Dashboard',       icon: 'dashboard',  path: '/dashboard',    permKey: 'Dashboard' },
    { label: 'Work Orders',     icon: 'workorders', path: '/work-orders',  permKey: 'Work Orders — View' },
    { label: 'Field Engineers', icon: 'engineers',  path: '/engineers',    permKey: 'Field Engineers — View' },
  ]},
  { section: 'Management', items: [
    { label: 'Users',      icon: 'users',      path: '/users',     permKey: 'Users — View' },
    { label: 'Customers',  icon: 'customers',  path: '/customers', permKey: 'Customers — View' },
    { label: 'Products',   icon: 'products',   path: '/products',  permKey: 'Products — View',  stub: true },
  ]},
  { section: 'Operations', items: [
    { label: 'Forms',             icon: 'forms',     path: '/forms',    permKey: 'Forms — View' },
    { label: 'Product Requests',  icon: 'requests',  path: '/requests', permKey: 'Product Requests — View', stub: true },
  ]},
  { section: 'System', items: [
    { label: 'Activities', icon: 'activities', path: '/activities', permKey: 'Activities — View' },
    { label: 'Settings', icon: 'settings', path: '/settings', permKey: 'Settings' },
  ]},
]

const ICONS: Record<string, React.ReactElement> = {
  dashboard: <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>,
  workorders: <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16"/></svg>,
  engineers: <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>,
  users: <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
  customers: <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
  products: <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>,
  forms: <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/></svg>,
  requests: <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>,
  settings: <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93l-1.41 1.41M12 2v2M4.93 4.93l1.41 1.41M2 12h2M4.93 19.07l1.41-1.41M12 20v2M19.07 19.07l-1.41-1.41M20 12h2"/></svg>,
  activities: <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>,
}

function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

export default function Sidebar({ userName, userRole, permissions, modules, userEmail }: SidebarProps) {
  // If permissions is empty (not yet configured), show everything as fallback.
  const hasPerms = Object.keys(permissions).length > 0
  function allowed(permKey: string) {
    if (!hasPerms) return true
    return permissions[permKey] === true
  }
  const pathname = usePathname()
  const router = useRouter()
  const [modOpen, setModOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [editProfileOpen, setEditProfileOpen] = useState(false)
  const [navigating, setNavigating] = useState<string | null>(null)
  const supabase = createClient()

  useEffect(() => {
    setNavigating(null)
  }, [pathname])

  async function logout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  function navigate(path: string) {
    if (path === pathname) return
    setNavigating(path)
    router.push(path)
  }

  return (
    <div style={{ width: 230, background: 'var(--mdk)', position: 'fixed', top: 0, left: 0, height: '100vh', display: 'flex', flexDirection: 'column', zIndex: 100 }}>
      <style>{`@keyframes navSpin { to { transform: rotate(360deg); } }`}</style>
      {/* Brand */}
      <div style={{ padding: '18px 16px 14px', borderBottom: '1px solid rgba(255,255,255,.06)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, background: 'var(--m)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="16" height="16" fill="none" stroke="white" strokeWidth="2" viewBox="0 0 24 24"><path d="M13 2L3 14h9l-1 8 10-12h-9z"/></svg>
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', letterSpacing: '-.3px' }}>EMR Portal</div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,.35)' }}>Suite</div>
          </div>
        </div>

        {/* Module switcher — only shown if user has access to more than one module */}
        {modules.length > 1 && (
          <div style={{ position: 'relative', marginTop: 12 }}>
            <div
              onClick={() => setModOpen(!modOpen)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 9, padding: '8px 10px', cursor: 'pointer' }}
            >
              <div style={{ width: 24, height: 24, background: 'var(--m)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="white" strokeWidth="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16"/></svg>
              </div>
              <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: '#fff' }}>Field Management</span>
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="rgba(255,255,255,.45)" strokeWidth="2" style={{ transition: 'transform .15s', transform: modOpen ? 'rotate(180deg)' : 'none', flexShrink: 0 }}><polyline points="6 9 12 15 18 9"/></svg>
            </div>

            {modOpen && (
              <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, background: '#2A0F1A', border: '1px solid rgba(255,255,255,.12)', borderRadius: 10, boxShadow: '0 12px 32px rgba(0,0,0,.4)', overflow: 'hidden', zIndex: 300 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'rgba(125,29,63,.35)', cursor: 'pointer' }}>
                  <div style={{ width: 26, height: 26, borderRadius: 7, background: 'var(--m)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="white" strokeWidth="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16"/></svg>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 500, color: '#fff' }}>Field Management</div>
                    <div style={{ fontSize: 9, color: 'rgba(255,255,255,.4)', marginTop: 1 }}>Work orders, engineers, SAP</div>
                  </div>
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#fff" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                </div>
                {modules.includes('sales') && <>
                  <div style={{ height: 1, background: 'rgba(255,255,255,.08)', margin: '2px 0' }}/>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', opacity: .4, cursor: 'default' }}>
                    <div style={{ width: 26, height: 26, borderRadius: 7, background: 'rgba(255,255,255,.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="rgba(255,255,255,.4)" strokeWidth="2"><path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, fontWeight: 500, color: '#fff' }}>Sales</div>
                      <div style={{ fontSize: 9, color: 'rgba(255,255,255,.4)', marginTop: 1 }}>Leads, accounts, pipeline</div>
                    </div>
                    <span style={{ fontSize: 8, fontWeight: 600, background: 'rgba(255,255,255,.1)', color: 'rgba(255,255,255,.5)', padding: '2px 6px', borderRadius: 4, textTransform: 'uppercase', letterSpacing: '.4px' }}>Coming soon</span>
                  </div>
                </>}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '10px 8px', overflowY: 'auto' }}>
        {NAV.map(({ section, items }) => {
          const visible = items.filter(item => allowed(item.permKey))
          if (visible.length === 0) return null
          return (
            <div key={section}>
              <div style={{ fontSize: 9, fontWeight: 600, color: 'rgba(255,255,255,.28)', letterSpacing: 1, padding: '10px 10px 4px', textTransform: 'uppercase' }}>{section}</div>
              {visible.map(item => {
                const active = pathname === item.path || pathname.startsWith(item.path + '/')
                const isLoading = navigating === item.path
                return (
                  <div
                    key={item.path}
                    onClick={() => navigate(item.path)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, cursor: 'pointer', marginBottom: 2,
                      background: active || isLoading ? 'var(--m)' : 'transparent',
                      color: active || isLoading ? '#fff' : 'rgba(255,255,255,.52)',
                      fontWeight: active || isLoading ? 500 : 400, fontSize: 12,
                      transition: 'all .15s',
                    }}
                    onMouseEnter={e => { if (!active && !isLoading) { (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,.07)'; (e.currentTarget as HTMLDivElement).style.color = 'rgba(255,255,255,.85)' } }}
                    onMouseLeave={e => { if (!active && !isLoading) { (e.currentTarget as HTMLDivElement).style.background = 'transparent'; (e.currentTarget as HTMLDivElement).style.color = 'rgba(255,255,255,.52)' } }}
                  >
                    {isLoading ? (
                      <span style={{ flexShrink: 0, width: 15, height: 15, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{
                          display: 'inline-block', width: 11, height: 11,
                          border: '2px solid rgba(255,255,255,.35)',
                          borderTop: '2px solid #fff',
                          borderRadius: '50%',
                          animation: 'navSpin 0.6s linear infinite',
                        }}/>
                      </span>
                    ) : (
                      <span style={{ opacity: active ? 1 : .8, flexShrink: 0 }}>{ICONS[item.icon]}</span>
                    )}
                    {item.label}
                  </div>
                )
              })}
            </div>
          )
        })}
      </nav>

      <EditProfileModal open={editProfileOpen} onClose={() => setEditProfileOpen(false)} userEmail={userEmail} />

      {/* Profile */}
      <div style={{ padding: '10px 8px', borderTop: '1px solid rgba(255,255,255,.06)' }}>
        <div
          onClick={() => setProfileOpen(!profileOpen)}
          style={{ display: 'flex', alignItems: 'center', gap: 9, padding: 10, borderRadius: 8, cursor: 'pointer', position: 'relative' }}
          onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,.07)'}
          onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = 'transparent'}
        >
          <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--ml)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, color: '#fff', flexShrink: 0 }}>
            {getInitials(userName)}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 500, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{userName}</div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,.38)' }}>{userRole}</div>
          </div>
          <svg width="13" height="13" fill="none" stroke="rgba(255,255,255,.35)" strokeWidth="2" viewBox="0 0 24 24"><polyline points="18 15 12 9 6 15"/></svg>

          {profileOpen && (
            <div style={{ position: 'absolute', bottom: 'calc(100% + 6px)', left: 0, right: 0, background: '#fff', borderRadius: 10, boxShadow: '0 8px 30px rgba(0,0,0,.2)', border: '1px solid var(--gm)', overflow: 'hidden', zIndex: 200 }}>
              <div onClick={() => { setProfileOpen(false); setEditProfileOpen(true) }} style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 14px', fontSize:12, color:'var(--tx)', cursor:'pointer' }}
                onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = 'var(--gl)'}
                onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = ''}
              >
                <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                Edit profile
              </div>
              <div style={{ height: 1, background: 'var(--gm)' }}/>
              <div
                onClick={logout}
                style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 14px', fontSize:12, color:'var(--red)', cursor:'pointer' }}
                onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = 'var(--gl)'}
                onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = ''}
              >
                <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/></svg>
                Logout
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
