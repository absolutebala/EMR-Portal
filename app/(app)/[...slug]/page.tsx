export const dynamic = 'force-dynamic'

const SECTION_LABELS: Record<string, { title: string; description: string; icon: string }> = {
  'work-orders': {
    title: 'Work Orders',
    description: 'Create and manage field service work orders, assign engineers, and track job progress from start to completion.',
    icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01',
  },
  engineers: {
    title: 'Field Engineers',
    description: 'Manage your field engineering team, track availability, assign skills, and monitor engineer performance across service zones.',
    icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z',
  },
  products: {
    title: 'Products',
    description: 'Manage your transformer product catalogue, track inventory levels, specifications, and product lifecycle across all categories.',
    icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4',
  },
  requests: {
    title: 'Product Requests',
    description: 'Review and approve product requests from field teams, manage procurement workflows, and track request fulfilment status.',
    icon: 'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10',
  },
}

const FALLBACK = {
  title: 'Coming Soon',
  description: 'This section is currently under development and will be available in a future sprint.',
  icon: 'M12 6v6m0 0v6m0-6h6m-6 0H6',
}

export default function StubPage({ params }: { params: { slug: string[] } }) {
  const key = params.slug?.[0] || ''
  const section = SECTION_LABELS[key] || FALLBACK

  return (
    <div style={{
      flex: 1,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      background: 'var(--gl)',
      padding: 40,
    }}>
      <div style={{ textAlign: 'center', maxWidth: 480 }}>
        {/* Icon circle */}
        <div style={{
          width: 80,
          height: 80,
          borderRadius: '50%',
          background: 'var(--mp)',
          border: '2px solid var(--mb)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 24px',
        }}>
          <svg width="34" height="34" fill="none" stroke="var(--m)" strokeWidth="1.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d={section.icon} />
          </svg>
        </div>

        {/* Badge */}
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          background: 'var(--mp)',
          border: '1px solid var(--mb)',
          borderRadius: 20,
          padding: '4px 12px',
          marginBottom: 16,
        }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--m)', animation: 'pulse 2s infinite' }} />
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--m)', textTransform: 'uppercase', letterSpacing: '.5px' }}>
            Coming Soon
          </span>
        </div>

        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--tx)', margin: '0 0 10px', letterSpacing: '-.3px' }}>
          {section.title}
        </h1>
        <p style={{ fontSize: 13, color: 'var(--txm)', lineHeight: 1.65, margin: '0 0 32px' }}>
          {section.description}
        </p>

        {/* Sprint tag */}
        <div style={{
          background: '#fff',
          border: '1px solid var(--gm)',
          borderRadius: 10,
          padding: '14px 20px',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 10,
          fontSize: 12,
          color: 'var(--txm)',
        }}>
          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/>
            <line x1="8" y1="2" x2="8" y2="6"/><line x1="16" y1="2" x2="16" y2="6"/>
          </svg>
          Scheduled for a future sprint — check back soon
        </div>
      </div>
    </div>
  )
}
