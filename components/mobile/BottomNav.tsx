'use client'

import { useRouter } from 'next/navigation'

interface Props {
  active: 'dashboard' | 'jobs'
}

const TABS: { id: 'dashboard' | 'jobs'; label: string; href: string; icon: React.ReactNode }[] = [
  {
    id: 'dashboard', label: 'Dashboard', href: '/mobile/dashboard',
    icon: (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
  },
  {
    id: 'jobs', label: 'Jobs', href: '/mobile/jobs',
    icon: (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16" />
      </svg>
    ),
  },
]

export default function BottomNav({ active }: Props) {
  const router = useRouter()

  return (
    <div style={{
      background: '#fff', display: 'flex', alignItems: 'center',
      borderTop: '1px solid #E5E0E3',
      padding: '0 4px', paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      height: 'calc(60px + env(safe-area-inset-bottom, 0px))',
      position: 'sticky', bottom: 0, zIndex: 10,
    }}>
      {TABS.map(tab => {
        const isActive = tab.id === active
        return (
          <button
            key={tab.id}
            onClick={() => router.push(tab.href)}
            style={{
              flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              gap: 3, padding: '6px 4px', border: 'none', background: 'transparent', cursor: 'pointer',
              color: isActive ? '#7D1D3F' : '#94A3B8',
            }}
          >
            <span style={{ display: 'flex' }}>{tab.icon}</span>
            <span style={{ fontSize: 9, fontWeight: isActive ? 600 : 500 }}>{tab.label}</span>
          </button>
        )
      })}
    </div>
  )
}
