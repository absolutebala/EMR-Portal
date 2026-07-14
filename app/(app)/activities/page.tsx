'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import Topbar from '@/components/layout/Topbar'
import { getActivities, getActivityActors, type ActivityLogRow, type ActivityActor } from '@/app/actions/get-activities'

const ENTITY_LABELS: Record<string, string> = {
  work_order: 'Work Order',
  user: 'User',
  role: 'Role',
}

const PAGE_SIZE = 50

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

export default function ActivitiesPage() {
  const [activities, setActivities] = useState<ActivityLogRow[]>([])
  const [actors, setActors] = useState<ActivityActor[]>([])
  const [currentUser, setCurrentUser] = useState({ name: '', role: '' })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actorFilter, setActorFilter] = useState('')
  const [entityFilter, setEntityFilter] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const supabase = createClient()

  const load = useCallback(async () => {
    setLoading(true)
    const { activities: data, total: t, error: err } = await getActivities({
      actorId: actorFilter || undefined,
      entityType: entityFilter || undefined,
      page,
    })
    setActivities(data)
    setTotal(t)
    setError(err)
    setLoading(false)
  }, [actorFilter, entityFilter, page])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    getActivityActors().then(({ actors: data }) => setActors(data))
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const userId = session?.user.id
      if (userId) supabase.from('profiles').select('first_name,last_name,role').eq('id', userId).single().then(({ data }) => {
        if (data) setCurrentUser({ name: `${data.first_name} ${data.last_name}`, role: data.role })
      })
    })
  }, [supabase])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <>
      <Topbar title="Activities" userName={currentUser.name} userRole={currentUser.role} />
      <div style={{ flex: 1, padding: '22px 24px' }}>

        <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
          <select
            value={actorFilter}
            onChange={e => { setActorFilter(e.target.value); setPage(1) }}
            style={{ fontSize: 12, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--gm)', color: 'var(--tx)', background: '#fff', fontFamily: 'Poppins,sans-serif', minWidth: 200 }}
          >
            <option value="">All users</option>
            {actors.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>

          <select
            value={entityFilter}
            onChange={e => { setEntityFilter(e.target.value); setPage(1) }}
            style={{ fontSize: 12, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--gm)', color: 'var(--tx)', background: '#fff', fontFamily: 'Poppins,sans-serif', minWidth: 160 }}
          >
            <option value="">All types</option>
            {Object.entries(ENTITY_LABELS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
        </div>

        <div style={{ background: '#fff', borderRadius: 10, border: '1px solid var(--gm)', overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--gm)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--tx)' }}>Activity log</span>
            <span style={{ fontSize: 11, color: 'var(--txm)' }}>{total} total</span>
          </div>

          {error && (
            <div style={{ padding: '12px 16px', fontSize: 12, color: '#DC2626', background: '#FEF2F2' }}>{error}</div>
          )}

          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--txm)', fontSize: 13 }}>Loading activities…</div>
          ) : activities.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--txm)', fontSize: 13 }}>No activity recorded yet.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
                <thead>
                  <tr>
                    {['Timestamp', 'Actor', 'Action', 'Entity Type'].map(h => (
                      <th key={h} style={{ padding: '9px 14px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: 'var(--txm)', textTransform: 'uppercase', letterSpacing: '.5px', borderBottom: '1px solid var(--gm)', background: '#FAFAFA', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {activities.map(a => (
                    <tr key={a.id} style={{ borderBottom: '1px solid var(--gm)' }}>
                      <td style={{ padding: '10px 14px', fontSize: 11, color: 'var(--txm)', whiteSpace: 'nowrap' }}>{formatTimestamp(a.created_at)}</td>
                      <td style={{ padding: '10px 14px', fontSize: 12, fontWeight: 500, color: 'var(--tx)', whiteSpace: 'nowrap' }}>{a.actor_name}</td>
                      <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--tx)' }}>{a.action}</td>
                      <td style={{ padding: '10px 14px', fontSize: 11, color: 'var(--txm)' }}>{ENTITY_LABELS[a.entity_type] || a.entity_type}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {totalPages > 1 && (
            <div style={{ padding: '12px 16px', borderTop: '1px solid var(--gm)', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1}
                style={{ fontSize: 11, padding: '6px 12px', borderRadius: 6, border: '1px solid var(--gm)', background: '#fff', color: page <= 1 ? 'var(--txm)' : 'var(--tx)', cursor: page <= 1 ? 'not-allowed' : 'pointer', fontFamily: 'Poppins,sans-serif' }}
              >
                Previous
              </button>
              <span style={{ fontSize: 11, color: 'var(--txm)' }}>Page {page} of {totalPages}</span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                style={{ fontSize: 11, padding: '6px 12px', borderRadius: 6, border: '1px solid var(--gm)', background: '#fff', color: page >= totalPages ? 'var(--txm)' : 'var(--tx)', cursor: page >= totalPages ? 'not-allowed' : 'pointer', fontFamily: 'Poppins,sans-serif' }}
              >
                Next
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
