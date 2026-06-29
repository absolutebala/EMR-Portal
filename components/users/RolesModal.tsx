'use client'

import Modal from '@/components/ui/Modal'

const PERMS = [
  { module: 'Dashboard', sa: true, sm: true, se: false, inv: false, dis: false, rep: true },
  { module: 'Work Orders — View', sa: true, sm: true, se: true, inv: false, dis: false, rep: true },
  { module: 'Work Orders — Create / Edit', sa: true, sm: true, se: false, inv: false, dis: false, rep: false },
  { module: 'Work Orders — Delete', sa: true, sm: false, se: false, inv: false, dis: false, rep: false },
  { module: 'Field Engineers — View', sa: true, sm: true, se: false, inv: false, dis: false, rep: true },
  { module: 'Field Engineers — Manage', sa: true, sm: true, se: false, inv: false, dis: false, rep: false },
  { module: 'Users — View', sa: true, sm: true, se: false, inv: false, dis: false, rep: false },
  { module: 'Users — Create / Edit', sa: true, sm: false, se: false, inv: false, dis: false, rep: false },
  { module: 'Customers — View', sa: true, sm: true, se: true, inv: false, dis: false, rep: true },
  { module: 'Customers — Create / Edit', sa: true, sm: true, se: false, inv: false, dis: false, rep: false },
  { module: 'Products — View', sa: true, sm: true, se: true, inv: true, dis: true, rep: true },
  { module: 'Forms — View', sa: true, sm: true, se: false, inv: false, dis: false, rep: false },
  { module: 'Forms — Create / Edit', sa: true, sm: false, se: false, inv: false, dis: false, rep: false },
  { module: 'Product Requests — View', sa: true, sm: true, se: true, inv: true, dis: true, rep: true },
  { module: 'Product Requests — Approve', sa: true, sm: true, se: false, inv: true, dis: false, rep: false },
  { module: 'Product Requests — Dispatch', sa: true, sm: false, se: false, inv: false, dis: true, rep: false },
  { module: 'MoM — View / Download', sa: true, sm: true, se: true, inv: false, dis: false, rep: true },
  { module: 'Settings', sa: true, sm: false, se: false, inv: false, dis: false, rep: false },
]

function Tick({ v }: { v: boolean }) {
  return v
    ? <span style={{ color: 'var(--green)', fontSize: 16, display: 'block', textAlign: 'center' }}>✓</span>
    : <span style={{ color: 'var(--gm)', fontSize: 14, display: 'block', textAlign: 'center' }}>—</span>
}

export default function RolesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Roles & Permissions" size="lg"
      footer={<button onClick={onClose} style={{ padding: '8px 14px', borderRadius: 7, border: '1px solid var(--gm)', background: '#fff', cursor: 'pointer', fontSize: 12, fontFamily: 'Poppins,sans-serif' }}>Close</button>}>
      <p style={{ fontSize: 12, color: 'var(--txm)', marginBottom: 16 }}>Reference permissions matrix for each role. Basic page-level access is enforced at the route level.</p>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
          <thead>
            <tr>
              <th style={{ padding: '9px 14px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: 'var(--txm)', textTransform: 'uppercase', letterSpacing: '.5px', borderBottom: '1px solid var(--gm)', background: '#FAFAFA' }}>Permission / Module</th>
              {['Super Admin', 'Svc. Manager', 'Engineer', 'Inventory', 'Dispatch', 'Reporting'].map(h => (
                <th key={h} style={{ padding: '9px 8px', textAlign: 'center', fontSize: 10, fontWeight: 600, color: 'var(--txm)', textTransform: 'uppercase', letterSpacing: '.5px', borderBottom: '1px solid var(--gm)', background: '#FAFAFA', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PERMS.map((p, i) => (
              <tr key={p.module} style={{ background: i % 2 === 0 ? 'var(--mp)' : '#fff', borderBottom: '1px solid var(--gm)' }}>
                <td style={{ padding: '8px 14px', fontSize: 12, fontWeight: p.module.includes('—') ? 400 : 600, paddingLeft: p.module.includes('—') ? 22 : 14 }}>{p.module}</td>
                <td style={{ padding: '8px 8px' }}><Tick v={p.sa}/></td>
                <td style={{ padding: '8px 8px' }}><Tick v={p.sm}/></td>
                <td style={{ padding: '8px 8px' }}><Tick v={p.se}/></td>
                <td style={{ padding: '8px 8px' }}><Tick v={p.inv}/></td>
                <td style={{ padding: '8px 8px' }}><Tick v={p.dis}/></td>
                <td style={{ padding: '8px 8px' }}><Tick v={p.rep}/></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  )
}
