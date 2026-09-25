'use client'

import { useEffect, useState } from 'react'
import { getSitePhotos, deleteSitePhoto } from '@/app/actions/site-photos'
import type { SitePhoto } from '@/lib/mobile/core/sitePhotos'

// Read-only gallery of the field engineer's site photos for a notification, shown on the
// desktop notification detail. Photos are added from the mobile app (see the RN / PWA
// notification screens). Click a thumbnail to view it full-size. Admins (canDelete) get a
// trash button per photo — deletion is still enforced server-side.
export default function SitePhotosCard({ workOrderId, canDelete = false }: { workOrderId: string; canDelete?: boolean }) {
  const [photos, setPhotos] = useState<SitePhoto[]>([])
  const [loading, setLoading] = useState(true)
  const [lightbox, setLightbox] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    getSitePhotos(workOrderId).then(r => { if (active) { setPhotos(r.photos); setLoading(false) } })
    return () => { active = false }
  }, [workOrderId])

  async function handleDelete(photoId: string) {
    if (!confirm('Delete this photo? This cannot be undone.')) return
    setDeletingId(photoId)
    const { error } = await deleteSitePhoto(photoId)
    setDeletingId(null)
    if (error) { alert(error); return }
    setPhotos(prev => prev.filter(p => p.id !== photoId))
  }

  if (loading) return null
  if (!photos.length) return null

  return (
    <div style={{ background: '#fff', borderRadius: 10, border: '1px solid var(--gm)', padding: 16, marginTop: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--tx)', marginBottom: 12 }}>Site Photos ({photos.length})</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 10 }}>
        {photos.map(p => (
          <div key={p.id} style={{ position: 'relative', aspectRatio: '1 / 1' }}>
            <button
              onClick={() => setLightbox(p.url)}
              title={`${p.uploaderName ?? 'Engineer'} · ${new Date(p.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true })}`}
              style={{ padding: 0, border: '1px solid var(--gm)', borderRadius: 8, overflow: 'hidden', cursor: 'pointer', background: '#F8F5F6', width: '100%', height: '100%' }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            </button>
            {canDelete && (
              <button
                onClick={() => handleDelete(p.id)}
                disabled={deletingId === p.id}
                title="Delete photo"
                style={{ position: 'absolute', top: 5, right: 5, width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, border: 'none', borderRadius: 6, background: 'rgba(0,0,0,0.6)', color: '#fff', cursor: deletingId === p.id ? 'default' : 'pointer' }}
              >
                <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M3 6h18M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2m2 0v14a1 1 0 01-1 1H7a1 1 0 01-1-1V6" /></svg>
              </button>
            )}
          </div>
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
