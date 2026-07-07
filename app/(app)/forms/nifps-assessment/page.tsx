import { createClient } from '@/lib/supabase/server'
import { getAssessments } from '@/app/actions/nifps-assessment'
import Topbar from '@/components/layout/Topbar'
import Link from 'next/link'

function statusBadge(status: string) {
  const map: Record<string, { bg: string; color: string }> = {
    draft: { bg: '#FEF3C7', color: '#92400E' },
    submitted: { bg: '#D1FAE5', color: '#065F46' },
  }
  const s = map[status] || { bg: 'var(--gl)', color: 'var(--txm)' }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 600, background: s.bg, color: s.color, textTransform: 'capitalize' }}>
      {status}
    </span>
  )
}

export default async function NifpsAssessmentListPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('first_name,last_name,role').eq('id', user!.id).single()
  const userName = profile ? `${profile.first_name} ${profile.last_name}` : 'User'
  const userRole = profile?.role || 'User'

  const { data: assessments } = await getAssessments()

  return (
    <>
      <Topbar title="NIFPS Assessments" userName={userName} userRole={userRole} />
      <div style={{ flex: 1, padding: '22px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--tx)' }}>NIFPS Installation – Assessment</div>
            <div style={{ fontSize: 12, color: 'var(--txm)', marginTop: 2 }}>{(assessments as unknown[]).length} assessment{(assessments as unknown[]).length !== 1 ? 's' : ''}</div>
          </div>
          <Link href="/forms/nifps-assessment/new"
            style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: 'var(--m)', color: '#fff', textDecoration: 'none', fontSize: 12, fontWeight: 500, fontFamily: 'Poppins,sans-serif', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            New assessment
          </Link>
        </div>

        {(assessments as unknown[]).length === 0 ? (
          <div style={{ background: '#fff', borderRadius: 10, border: '1px solid var(--gm)', padding: 48, textAlign: 'center' }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--txm)' }}>No assessments yet</div>
            <div style={{ fontSize: 11, color: 'var(--txm)', marginTop: 4 }}>Click "New assessment" to start one.</div>
          </div>
        ) : (
          <div style={{ background: '#fff', borderRadius: 10, border: '1px solid var(--gm)', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Customer', 'Date', 'Engineer', 'Status', ''].map(h => (
                    <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: 'var(--txm)', textTransform: 'uppercase', letterSpacing: '.5px', borderBottom: '1px solid var(--gm)', background: '#FAFAFA' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(assessments as Record<string, unknown>[]).map(a => {
                  const fd = (a.form_data as Record<string, string>) || {}
                  return (
                    <tr key={a.id as string} style={{ borderBottom: '1px solid var(--gm)' }}>
                      <td style={{ padding: '12px 16px', fontSize: 12, fontWeight: 500, color: 'var(--tx)' }}>{fd.customer_name || '—'}</td>
                      <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--txm)' }}>{fd.date ? new Date(fd.date).toLocaleDateString('en-IN') : '—'}</td>
                      <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--txm)' }}>{fd.engineer_name || '—'}</td>
                      <td style={{ padding: '12px 16px' }}>{statusBadge(a.status as string)}</td>
                      <td style={{ padding: '12px 16px' }}>
                        <Link href={`/forms/nifps-assessment/${a.id}`} style={{ fontSize: 12, color: 'var(--m)', textDecoration: 'none', fontWeight: 500 }}>Open →</Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}
