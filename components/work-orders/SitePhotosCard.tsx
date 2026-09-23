'use client'

import { useEffect, useState } from 'react'
import { getSitePhotos } from '@/app/actions/site-photos'
import type { SitePhoto } from '@/lib/mobile/core/sitePhotos'

// Read-only gallery of the field engineer's site photos for a notification, shown on the
// desktop notification detail. Photos are added from the mobile app (see the RN / PWA
// notification screens). Click a thumbnail to view it full-size.
export default function SitePhotosCard({ workOrderId }: { workOrderId: string }) {
  const [photos, setPhotos] = useState<SitePhoto[]>([])
  const [loading, setLoading] = useState(true)
  const [lightbox, setLightbox] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    getSitePhotos(workOrderId).then(r => { if (active) { setPhotos(r.photos); setLoading(false) } })
    return () => { active = false }
  }, [workOrderId])

  if (loading) return null
  if (!photos.length) return null

  return (
    <div style={{ background: '#fff', borderRadius: 10, border: '1px solid var(--gm)', padding: 16, marginTop: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--tx)', marginBottom: 12 }}>Site Photos ({photos.length})</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 10 }}>
        {photos.map(p => (
          <button
            key={p.id}
            onClick={() => setLightbox(p.url)}
            title={`${p.uploaderName ?? 'Engineer'} · ${new Date(p.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true })}`}
            style={{ padding: 0, border: '1px solid var(--gm)', borderRadius: 8, overflow: 'hidden', cursor: 'pointer', background: '#F8F5F6', aspectRatio: '1 / 1' }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          </button>
        ))}
      </div>

      {lightbox && (
        <div
          onClick={() => setLightbox(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 8 }} />
        </div>
      )}
    </div>
  )
}
