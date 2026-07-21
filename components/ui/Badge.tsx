const ROLE_COLORS: Record<string, { bg: string; color: string }> = {
  'Super Admin': { bg: 'var(--mp)', color: 'var(--m)' },
  'Service Manager': { bg: '#DBEAFE', color: '#1E40AF' },
  'Field Engineer': { bg: '#D1FAE5', color: '#065F46' },
  'Sales Executive Engineer': { bg: '#EDE9FE', color: '#5B21B6' },
  'Inventory Team': { bg: '#FEF3C7', color: '#92400E' },
  'Dispatch Team': { bg: '#CFFAFE', color: '#164E63' },
  'Reporting Team': { bg: '#F1F5F9', color: '#475569' },
}

export function RoleBadge({ role }: { role: string }) {
  const style = ROLE_COLORS[role] || { bg: 'var(--gl)', color: 'var(--txm)' }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 500, background: style.bg, color: style.color }}>
      {role}
    </span>
  )
}

export function StatusBadge({ active, pending }: { active: boolean; pending?: boolean }) {
  if (pending) return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 500, background: '#FEF3C7', color: '#92400E' }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#F59E0B', display: 'inline-block' }} />
      Invite Pending
    </span>
  )
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 500, background: active ? '#D1FAE5' : '#F1F5F9', color: active ? '#065F46' : '#475569' }}>
      {active ? 'Active' : 'Inactive'}
    </span>
  )
}

export function JobTypeBadge({ type }: { type: string }) {
  const labels: Record<string, string> = {
    site_inspection: 'Site Inspection',
    amc: 'AMC',
    commissioning_activities: 'Commissioning',
    supervision: 'Supervision',
    overhauling: 'Overhauling',
    complaint: 'Complaint',
    installation: 'Installation',
    testing: 'Testing',
    business_opportunity: 'Business Opportunity',
  }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 500, background: 'var(--gl)', color: 'var(--txm)' }}>
      {labels[type] || type}
    </span>
  )
}

export function FormStatusBadge({ status }: { status: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 500, background: status === 'active' ? '#D1FAE5' : '#F1F5F9', color: status === 'active' ? '#065F46' : '#475569' }}>
      {status === 'active' ? 'Active' : 'Draft'}
    </span>
  )
}

export function CustomerTypeBadge({ type }: { type: string }) {
  const labels: Record<string, { label: string; bg: string; color: string }> = {
    sold: { label: 'Sold', bg: '#D1FAE5', color: '#065F46' },
    shipped: { label: 'Shipped', bg: '#DBEAFE', color: '#1E40AF' },
    both: { label: 'Both', bg: 'var(--mp)', color: 'var(--m)' },
  }
  const s = labels[type] || { label: type, bg: 'var(--gl)', color: 'var(--txm)' }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 500, background: s.bg, color: s.color }}>
      {s.label}
    </span>
  )
}
