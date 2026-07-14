'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import type { ReactNode } from 'react'

interface Props {
  title: string
  subtitle?: string
  backHref?: string
  rightSlot?: ReactNode
}

export default function MobileHeader({ title, subtitle, backHref, rightSlot }: Props) {
  const router = useRouter()

  useEffect(() => {
    if (backHref) router.prefetch(backHref)
  }, [router, backHref])

  return (
    <div style={{
      background: '#3A0A1C',
      padding: '14px 16px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      position: 'sticky', top: 0, zIndex: 10,
      boxShadow: '0 2px 8px rgba(61,10,28,0.25)',
      gap: 10,
    }}>
      {backHref ? (
        <button
          className="mtap"
          onClick={() => router.push(backHref)}
          style={{
            background: 'rgba(255,255,255,0.12)', border: 'none', borderRadius: 20,
            padding: '6px 12px', color: 'rgba(255,255,255,0.9)', fontSize: 11, fontWeight: 500,
            display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer',
            fontFamily: 'Poppins, sans-serif', flexShrink: 0,
          }}
        >
          <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Back
        </button>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
          <div style={{
            width: 28, height: 28, background: '#A8294F', borderRadius: 8,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <svg width="14" height="14" fill="none" stroke="white" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M13 2L3 14h9l-1 8 10-12h-9z" />
            </svg>
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{title}</div>
            {subtitle && (
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {subtitle}
              </div>
            )}
          </div>
        </div>
      )}

      {backHref && (
        <span style={{ fontSize: 14, fontWeight: 600, color: '#fff', flex: 1, textAlign: 'center' }}>{title}</span>
      )}

      {rightSlot ?? (backHref ? <div style={{ width: 60, flexShrink: 0 }} /> : null)}
    </div>
  )
}
