'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { saveAssessment } from '@/app/actions/nifps-assessment'

// ── Styles ───────────────────────────────────────────────────────────────────
const fi: React.CSSProperties = { padding: '7px 10px', border: '1.5px solid var(--gm)', borderRadius: 6, fontSize: 12, color: 'var(--tx)', outline: 'none', fontFamily: 'Poppins,sans-serif', width: '100%', background: '#fff' }
const sel: React.CSSProperties = { ...fi }
const ta: React.CSSProperties = { ...fi, resize: 'vertical', minHeight: 60 }
const label: React.CSSProperties = { fontSize: 10, fontWeight: 500, color: '#6B7280', display: 'block', marginBottom: 3 }
const sectionHead: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: 'var(--tx)', textTransform: 'uppercase', letterSpacing: '.6px', padding: '10px 18px', background: '#F8FAFC', borderBottom: '1px solid var(--gm)', borderTop: '1px solid var(--gm)', marginTop: 8 }
const card: React.CSSProperties = { background: '#fff', borderRadius: 10, border: '1px solid var(--gm)', overflow: 'hidden', marginBottom: 16 }
const grid2: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }
const grid3: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }

function Field({ lbl, children }: { lbl: string; children: React.ReactNode }) {
  return <div><label style={label}>{lbl}</label>{children}</div>
}

function SectionTitle({ title }: { title: string }) {
  return <div style={sectionHead}>{title}</div>
}

function MeasurementRow({ sno, desc, value, unit, onChange }: { sno: string; desc: string; value: string; unit?: string; onChange: (v: string) => void }) {
  return (
    <tr style={{ borderBottom: '1px solid var(--gm)' }}>
      <td style={{ padding: '8px 14px', fontSize: 12, color: 'var(--txm)', width: 50 }}>{sno}</td>
      <td style={{ padding: '8px 14px', fontSize: 12, color: 'var(--tx)', flex: 1 }}>{desc}</td>
      <td style={{ padding: '6px 10px', width: 100 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <input style={{ ...fi, textAlign: 'right' }} value={value} onChange={e => onChange(e.target.value)} placeholder="—" />
          {unit && <span style={{ fontSize: 11, color: 'var(--txm)', whiteSpace: 'nowrap' }}>{unit}</span>}
        </div>
      </td>
    </tr>
  )
}

function MaterialRow({ sno, desc, uom, value, onChange }: { sno: number; desc: string; uom?: string; value: string; onChange: (v: string) => void }) {
  return (
    <tr style={{ borderBottom: '1px solid var(--gm)' }}>
      <td style={{ padding: '8px 14px', fontSize: 12, color: 'var(--txm)', width: 40 }}>{sno}</td>
      <td style={{ padding: '8px 14px', fontSize: 12, color: 'var(--tx)' }}>{desc}</td>
      <td style={{ padding: '8px 14px', fontSize: 11, color: 'var(--txm)', width: 60, textAlign: 'center' }}>{uom || '—'}</td>
      <td style={{ padding: '6px 10px', width: 90 }}>
        <input style={{ ...fi, textAlign: 'right' }} value={value} onChange={e => onChange(e.target.value)} placeholder="—" />
      </td>
    </tr>
  )
}

interface FormData {
  // Header
  customer_name: string; customer_phone: string; site_address: string; date: string
  rating: string; year_of_mfg: string; serial_number: string
  engineer_name: string; engineer_phone: string
  // Pipe measurements (mm)
  pipe_1in_a: string; pipe_1in_b: string
  pipe_3in_a: string; pipe_3in_b: string
  // Materials
  materials_remarks: string
  // Cable requirements (m)
  cable_2c_a: string; cable_2c_b: string
  cable_3c_1: string
  cable_19c_a: string; cable_19c_b: string
  // Observations
  obs1_status: string; obs1_details: string
  obs2_l: string; obs2_b: string; obs2_h: string; obs2_details: string
  obs3_status: string; obs3_details: string
  obs4_status: string; obs4_details: string
  obs5_details: string
  obs6_status: string; obs6_details: string
  obs7_details: string; obs8_details: string
  // Material requirement quantities
  mr_80nb_pipe: string; mr_80nb_flange: string; mr_80nb_elbow: string
  mr_80nb_tjoint: string; mr_80nb_gasket: string; mr_80nb_ubolt: string
  mr_m16_80_bolt: string; mr_l_ang_300: string; mr_l_ang_200: string
  mr_anchor_bolt: string; mr_25nb_pipe: string; mr_25nb_flange: string
  mr_25nb_elbow: string; mr_25nb_tjoint: string; mr_25nb_ubolt: string
  mr_25nb_gasket: string; mr_m12_60_bolt: string
  // Arc sensor retrofitting
  arc_straight: string; arc_tilt: string; arc_sensor: string; arc_gasket: string
  // Oil drain retrofitting
  oil_gate_valve: string; oil_pipe: string; oil_fasteners: string
  oil_flange: string; oil_gasket: string
  // N2 injection retrofitting
  n2_50_gate: string; n2_50_flange: string; n2_50_gasket: string; n2_50_pipe: string
  n2_80_gate: string; n2_80_flange: string; n2_80_gasket: string; n2_80_pipe: string
  n2_25_gate: string; n2_25_flange: string; n2_25_gasket: string; n2_25_pipe: string
  n2_80_50_red: string; n2_50_25_red: string
  n2_m16_fast: string; n2_m12_fast: string
  // Air release system
  air_3inch: string; air_1inch: string
  // Final cables
  fc_19core: string; fc_lhd: string; fc_3core: string; fc_2core: string
  // Signatures
  sig_cust_name: string; sig_cust_phone: string
  sig_emr_name: string; sig_emr_phone: string
}

const EMPTY: FormData = {
  customer_name: '', customer_phone: '', site_address: '', date: new Date().toISOString().slice(0, 10),
  rating: '', year_of_mfg: '', serial_number: '',
  engineer_name: '', engineer_phone: '',
  pipe_1in_a: '', pipe_1in_b: '', pipe_3in_a: '', pipe_3in_b: '',
  materials_remarks: '',
  cable_2c_a: '', cable_2c_b: '', cable_3c_1: '', cable_19c_a: '', cable_19c_b: '',
  obs1_status: '', obs1_details: '',
  obs2_l: '', obs2_b: '', obs2_h: '', obs2_details: '',
  obs3_status: '', obs3_details: '',
  obs4_status: '', obs4_details: '',
  obs5_details: '', obs6_status: '', obs6_details: '',
  obs7_details: '', obs8_details: '',
  mr_80nb_pipe: '', mr_80nb_flange: '', mr_80nb_elbow: '', mr_80nb_tjoint: '',
  mr_80nb_gasket: '', mr_80nb_ubolt: '', mr_m16_80_bolt: '', mr_l_ang_300: '',
  mr_l_ang_200: '', mr_anchor_bolt: '', mr_25nb_pipe: '', mr_25nb_flange: '',
  mr_25nb_elbow: '', mr_25nb_tjoint: '', mr_25nb_ubolt: '', mr_25nb_gasket: '', mr_m12_60_bolt: '',
  arc_straight: '', arc_tilt: '', arc_sensor: '', arc_gasket: '',
  oil_gate_valve: '', oil_pipe: '', oil_fasteners: '', oil_flange: '', oil_gasket: '',
  n2_50_gate: '', n2_50_flange: '', n2_50_gasket: '', n2_50_pipe: '',
  n2_80_gate: '', n2_80_flange: '', n2_80_gasket: '', n2_80_pipe: '',
  n2_25_gate: '', n2_25_flange: '', n2_25_gasket: '', n2_25_pipe: '',
  n2_80_50_red: '', n2_50_25_red: '', n2_m16_fast: '', n2_m12_fast: '',
  air_3inch: '', air_1inch: '',
  fc_19core: '', fc_lhd: '', fc_3core: '', fc_2core: '',
  sig_cust_name: '', sig_cust_phone: '', sig_emr_name: '', sig_emr_phone: '',
}

interface Props {
  id?: string
  initialData?: Partial<FormData>
  initialStatus?: 'draft' | 'submitted'
  customerId?: string | null
  transformerId?: string | null
}

export default function NifpsAssessmentForm({ id, initialData, initialStatus, customerId, transformerId }: Props) {
  const router = useRouter()
  const [form, setForm] = useState<FormData>({ ...EMPTY, ...initialData })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  const f = useCallback((k: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setForm(prev => ({ ...prev, [k]: e.target.value }))
    setSaved(false)
  }, [])

  const fv = (k: keyof FormData) => form[k] as string

  async function handleSave(status: 'draft' | 'submitted') {
    setSaving(true)
    setError('')
    const { id: savedId, error } = await saveAssessment({
      id,
      customer_id: customerId || null,
      transformer_id: transformerId || null,
      status,
      form_data: form as unknown as Record<string, unknown>,
    })
    setSaving(false)
    if (error) { setError(error); return }
    setSaved(true)
    if (!id && savedId) router.replace(`/forms/nifps-assessment/${savedId}`)
  }

  const thStyle: React.CSSProperties = { padding: '8px 14px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: 'var(--txm)', textTransform: 'uppercase', letterSpacing: '.5px', background: '#FAFAFA', borderBottom: '1px solid var(--gm)' }
  const obs = (n: number, title: string, statusOpts: string[], statusKey: keyof FormData | null, detailsKey: keyof FormData, extra?: React.ReactNode) => (
    <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--gm)' }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--tx)', marginBottom: 8 }}>{n}. {title}</div>
      {extra}
      {statusKey && (
        <div style={{ marginBottom: 8 }}>
          <label style={label}>Status</label>
          <select style={{ ...sel, maxWidth: 220 }} value={fv(statusKey)} onChange={f(statusKey)}>
            <option value="">Select…</option>
            {statusOpts.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
      )}
      <div>
        <label style={label}>Details / विवरण</label>
        <textarea style={ta} value={fv(detailsKey)} onChange={f(detailsKey)} placeholder="Enter details…" />
      </div>
    </div>
  )

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', paddingBottom: 60 }}>
      {/* Sticky action bar */}
      <div style={{ position: 'sticky', top: 0, zIndex: 10, background: '#fff', borderBottom: '1px solid var(--gm)', padding: '10px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--tx)' }}>NIFPS Installation – Assessment</div>
          {saved && <div style={{ fontSize: 11, color: '#059669' }}>Saved</div>}
          {error && <div style={{ fontSize: 11, color: '#DC2626' }}>{error}</div>}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => router.back()} style={{ padding: '7px 14px', borderRadius: 7, border: '1px solid var(--gm)', background: '#fff', cursor: 'pointer', fontSize: 12, fontFamily: 'Poppins,sans-serif' }}>
            Cancel
          </button>
          <button onClick={() => handleSave('draft')} disabled={saving} style={{ padding: '7px 14px', borderRadius: 7, border: '1px solid var(--mb)', background: 'var(--mp)', color: 'var(--m)', cursor: 'pointer', fontSize: 12, fontWeight: 500, fontFamily: 'Poppins,sans-serif', opacity: saving ? .7 : 1 }}>
            {saving ? 'Saving…' : 'Save draft'}
          </button>
          <button onClick={() => handleSave('submitted')} disabled={saving} style={{ padding: '7px 14px', borderRadius: 7, border: 'none', background: 'var(--m)', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 500, fontFamily: 'Poppins,sans-serif', opacity: saving ? .7 : 1 }}>
            Submit
          </button>
        </div>
      </div>

      {/* ── Section 1: Header ─────────────────────────────────────────────── */}
      <div style={card}>
        <SectionTitle title="Customer & Transformer Details" />
        <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={grid3}>
            <Field lbl="Customer name *"><input style={fi} value={fv('customer_name')} onChange={f('customer_name')} placeholder="Customer name" /></Field>
            <Field lbl="Phone no."><input style={fi} value={fv('customer_phone')} onChange={f('customer_phone')} placeholder="+91 XXXXXXXXXX" /></Field>
            <Field lbl="Date"><input type="date" style={fi} value={fv('date')} onChange={f('date')} /></Field>
          </div>
          <Field lbl="Site address"><input style={fi} value={fv('site_address')} onChange={f('site_address')} placeholder="Full site address" /></Field>
          <div style={grid3}>
            <Field lbl="Rating"><input style={fi} value={fv('rating')} onChange={f('rating')} placeholder="e.g. 100 KVA" /></Field>
            <Field lbl="Year of manufacture"><input style={fi} value={fv('year_of_mfg')} onChange={f('year_of_mfg')} placeholder="e.g. 2019" /></Field>
            <Field lbl="Serial number"><input style={fi} value={fv('serial_number')} onChange={f('serial_number')} placeholder="SN-TR-XXXXX" /></Field>
          </div>
          <div style={grid2}>
            <Field lbl="EMR Engineer name"><input style={fi} value={fv('engineer_name')} onChange={f('engineer_name')} placeholder="Engineer name" /></Field>
            <Field lbl="EMR Engineer phone"><input style={fi} value={fv('engineer_phone')} onChange={f('engineer_phone')} placeholder="+91 XXXXXXXXXX" /></Field>
          </div>
        </div>
      </div>

      {/* ── Section 2: Oil & N2 Pipe Line Measurements ───────────────────── */}
      <div style={card}>
        <SectionTitle title="Oil and Nitrogen Pipe Line Measurement (mm)" />
        <div style={{ padding: '8px 18px 4px', fontSize: 11, color: 'var(--txm)', fontStyle: 'italic' }}>
          All dimensions in millimetres (mm). Confirm gate valve dimension with PCD in transformer.
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={thStyle}>S.No.</th>
              <th style={thStyle}>Description</th>
              <th style={{ ...thStyle, textAlign: 'right', width: 130 }}>mm</th>
            </tr>
          </thead>
          <tbody>
            <tr><td colSpan={3} style={{ padding: '6px 14px', fontSize: 11, fontWeight: 600, color: 'var(--m)', background: 'var(--mp)' }}>1-Inch Pipe</td></tr>
            <MeasurementRow sno="(a)" desc="Transformer quick drain valve to switch yard cubicle" value={fv('pipe_1in_a')} onChange={v => setForm(p => ({ ...p, pipe_1in_a: v }))} unit="mm" />
            <MeasurementRow sno="(b)" desc="Supporting of oil and nitrogen pipe" value={fv('pipe_1in_b')} onChange={v => setForm(p => ({ ...p, pipe_1in_b: v }))} unit="mm" />
            <tr><td colSpan={3} style={{ padding: '6px 14px', fontSize: 11, fontWeight: 600, color: 'var(--m)', background: 'var(--mp)' }}>3-Inch Pipe</td></tr>
            <MeasurementRow sno="(a)" desc="Transformer oil drain valve to switch yard cubicle" value={fv('pipe_3in_a')} onChange={v => setForm(p => ({ ...p, pipe_3in_a: v }))} unit="mm" />
            <MeasurementRow sno="(b)" desc="Cubicle panel to oil sump" value={fv('pipe_3in_b')} onChange={v => setForm(p => ({ ...p, pipe_3in_b: v }))} unit="mm" />
          </tbody>
        </table>
        <div style={{ padding: 18 }}>
          <label style={label}>Materials — Pipe Elbow, T-Joints, L-Angle plate, Flanges, Fasteners, Painting etc. — Remarks</label>
          <textarea style={ta} value={fv('materials_remarks')} onChange={f('materials_remarks')} placeholder="Remarks…" />
        </div>
      </div>

      {/* ── Section 3: Cable Requirements ────────────────────────────────── */}
      <div style={card}>
        <SectionTitle title="Cable Requirement Details (meters)" />
        <div style={{ padding: '8px 18px 4px', fontSize: 11, color: 'var(--txm)', fontStyle: 'italic' }}>All dimensions in metres.</div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={thStyle}>S.No.</th>
              <th style={thStyle}>Description</th>
              <th style={{ ...thStyle, textAlign: 'right', width: 130 }}>Length (m)</th>
            </tr>
          </thead>
          <tbody>
            <tr><td colSpan={3} style={{ padding: '6px 14px', fontSize: 11, fontWeight: 600, color: 'var(--m)', background: 'var(--mp)' }}>2-Core Cable</td></tr>
            <MeasurementRow sno="(A)" desc="Individual Arc Sensor to Signal Box" value={fv('cable_2c_a')} onChange={v => setForm(p => ({ ...p, cable_2c_a: v }))} unit="m" />
            <MeasurementRow sno="(B)" desc="Shutter Valve to Signal Box Interconnection" value={fv('cable_2c_b')} onChange={v => setForm(p => ({ ...p, cable_2c_b: v }))} unit="m" />
            <tr><td colSpan={3} style={{ padding: '6px 14px', fontSize: 11, fontWeight: 600, color: 'var(--m)', background: 'var(--mp)' }}>3-Core Cable</td></tr>
            <MeasurementRow sno="1" desc="Power supply for NIFPS Control Panel" value={fv('cable_3c_1')} onChange={v => setForm(p => ({ ...p, cable_3c_1: v }))} unit="m" />
            <tr><td colSpan={3} style={{ padding: '6px 14px', fontSize: 11, fontWeight: 600, color: 'var(--m)', background: 'var(--mp)' }}>19-Core Cable</td></tr>
            <MeasurementRow sno="(A)" desc="Switch Yard Cubicle to NIFPS Control Panel" value={fv('cable_19c_a')} onChange={v => setForm(p => ({ ...p, cable_19c_a: v }))} unit="m" />
            <MeasurementRow sno="(B)" desc="NIFPS Control Panel inter-connection to Transformer C&R Panel" value={fv('cable_19c_b')} onChange={v => setForm(p => ({ ...p, cable_19c_b: v }))} unit="m" />
          </tbody>
        </table>
      </div>

      {/* ── Section 4: Details to be Observed ────────────────────────────── */}
      <div style={card}>
        <SectionTitle title="Details to be Observed" />
        {obs(1, 'Status of switch yard cubicle panel plinth and oil sump construction', ['In Progress', 'Completed'], 'obs1_status', 'obs1_details')}
        {obs(2, 'Check Arc Sensor fixing provisions in transformer and measure inspection window dimensions (L × B × H)', [], null, 'obs2_details',
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 8 }}>
            <Field lbl="Length (mm)"><input style={fi} value={fv('obs2_l')} onChange={f('obs2_l')} placeholder="L" /></Field>
            <Field lbl="Breadth (mm)"><input style={fi} value={fv('obs2_b')} onChange={f('obs2_b')} placeholder="B" /></Field>
            <Field lbl="Height (mm)"><input style={fi} value={fv('obs2_h')} onChange={f('obs2_h')} placeholder="H" /></Field>
          </div>
        )}
        {obs(3, 'Sand digging work for laying 3-inch pipe from switch yard cubicle to oil sump and making hole (3 inch) in oil sump', ['Provided', 'Not Provided'], 'obs3_status', 'obs3_details')}
        {obs(4, 'Cable routing/trench from switch yard to control room (for cable laying to NIFPS control panel)', ['In Progress', 'Completed'], 'obs4_status', 'obs4_details')}
        {obs(5, 'Obtain the details from customer for mounting of NIFPS control panel', [], null, 'obs5_details')}
        {obs(6, 'Control room construction work status', ['In Progress', 'Completed'], 'obs6_status', 'obs6_details')}
        {obs(7, 'Inform customer for arranging power source for pipeline fabrication work', [], null, 'obs7_details')}
        {obs(8, 'Inform customer for arranging power source for pipeline fabrication work — Informed', [], null, 'obs8_details')}
      </div>

      {/* ── Section 5: Material Requirement ──────────────────────────────── */}
      <div style={card}>
        <SectionTitle title="Material Requirement" />
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={thStyle}>S.No.</th>
              <th style={thStyle}>Description</th>
              <th style={{ ...thStyle, textAlign: 'center' }}>UOM</th>
              <th style={{ ...thStyle, textAlign: 'right', width: 100 }}>Qty</th>
            </tr>
          </thead>
          <tbody>
            {([
              [1, '80 NB Pipe (GI)', 'm', 'mr_80nb_pipe'],
              [2, '80 NB Flange (GI)', '', 'mr_80nb_flange'],
              [3, '80 NB Elbow (GI)', '', 'mr_80nb_elbow'],
              [4, '80 NB T Joint (GI)', '', 'mr_80nb_tjoint'],
              [5, '80 NB Gasket – 4 Holes', '', 'mr_80nb_gasket'],
              [6, '80 NB U-Bolt with Nut (Set)', 'Set', 'mr_80nb_ubolt'],
              [7, 'M16 × 80 Bolt, Nut with Washer (Set)', 'Set', 'mr_m16_80_bolt'],
              [8, 'Support L Angle Plate 300 mm (MS)', '', 'mr_l_ang_300'],
              [9, 'Support L Angle Plate 200 mm (MS)', '', 'mr_l_ang_200'],
              [10, 'Anchor Bolt M10 Set', 'Set', 'mr_anchor_bolt'],
              [11, '25 NB Pipe (GI)', 'm', 'mr_25nb_pipe'],
              [12, '25 NB Flange (GI)', '', 'mr_25nb_flange'],
              [13, '25 NB Elbow (GI)', '', 'mr_25nb_elbow'],
              [14, '25 NB T Joint (GI)', '', 'mr_25nb_tjoint'],
              [15, '25 NB U-Bolt with Nut (Set)', 'Set', 'mr_25nb_ubolt'],
              [16, '25 NB Gasket – 4 Holes', '', 'mr_25nb_gasket'],
              [17, 'M12 × 60 Bolt, Nut with Washer (Set)', 'Set', 'mr_m12_60_bolt'],
            ] as [number, string, string, keyof FormData][]).map(([sno, desc, uom, key]) => (
              <MaterialRow key={key} sno={sno} desc={desc} uom={uom} value={fv(key)} onChange={v => setForm(p => ({ ...p, [key]: v }))} />
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Section 6: Arc Sensors Retrofitting ──────────────────────────── */}
      <div style={card}>
        <SectionTitle title="Retrofitting Materials — Arc Sensors Fixing Work" />
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th style={thStyle}>S.No.</th><th style={thStyle}>Description</th><th style={{ ...thStyle, textAlign: 'center' }}>UOM</th><th style={{ ...thStyle, textAlign: 'right', width: 100 }}>Qty</th></tr></thead>
          <tbody>
            {([
              [1, 'Retro arc sensor flange (Straight) with stud & nuts', '', 'arc_straight'],
              [2, 'Retro arc sensor flange (Tilt) with stud & nuts', '', 'arc_tilt'],
              [3, 'Arc sensors', '', 'arc_sensor'],
              [4, 'Arc sensors Gasket', '', 'arc_gasket'],
            ] as [number, string, string, keyof FormData][]).map(([sno, desc, uom, key]) => (
              <MaterialRow key={key} sno={sno} desc={desc} uom={uom} value={fv(key)} onChange={v => setForm(p => ({ ...p, [key]: v }))} />
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Section 7: Oil Drain Line Retrofitting ────────────────────────── */}
      <div style={card}>
        <SectionTitle title="Oil Drain Line Retrofitting Materials" />
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th style={thStyle}>S.No.</th><th style={thStyle}>Description</th><th style={{ ...thStyle, textAlign: 'center' }}>UOM</th><th style={{ ...thStyle, textAlign: 'right', width: 100 }}>Qty</th></tr></thead>
          <tbody>
            {([
              [1, '50 NB Gate Valve', '', 'oil_gate_valve'],
              [2, '50 NB Pipe', 'm', 'oil_pipe'],
              [3, 'M16 × 60 Fasteners Set', 'Set', 'oil_fasteners'],
              [4, '50 NB Flange', '', 'oil_flange'],
              [5, '50 NB Gasket', '', 'oil_gasket'],
            ] as [number, string, string, keyof FormData][]).map(([sno, desc, uom, key]) => (
              <MaterialRow key={key} sno={sno} desc={desc} uom={uom} value={fv(key)} onChange={v => setForm(p => ({ ...p, [key]: v }))} />
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Section 8: N2 Injection Line Retrofitting ─────────────────────── */}
      <div style={card}>
        <SectionTitle title="N2 Injection Line Retrofitting Materials" />
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th style={thStyle}>S.No.</th><th style={thStyle}>Description</th><th style={{ ...thStyle, textAlign: 'center' }}>UOM</th><th style={{ ...thStyle, textAlign: 'right', width: 100 }}>Qty</th></tr></thead>
          <tbody>
            {([
              [1, '50 NB Gate Valve', '', 'n2_50_gate'],
              [2, '50 NB Flange', '', 'n2_50_flange'],
              [3, '50 NB Gasket', '', 'n2_50_gasket'],
              [4, '50 NB Pipe', 'm', 'n2_50_pipe'],
              [5, '80 NB Gate Valve', '', 'n2_80_gate'],
              [6, '80 NB Flange', '', 'n2_80_flange'],
              [7, '80 NB Gasket', '', 'n2_80_gasket'],
              [8, '80 NB Pipe', 'm', 'n2_80_pipe'],
              [9, '25 NB Gate Valve', '', 'n2_25_gate'],
              [10, '25 NB Flange', '', 'n2_25_flange'],
              [11, '25 NB Gasket', '', 'n2_25_gasket'],
              [12, '25 NB Pipe', 'm', 'n2_25_pipe'],
              [13, '80 NB to 50 NB Reducer', '', 'n2_80_50_red'],
              [14, '50 NB to 25 NB Reducer', '', 'n2_50_25_red'],
              [15, 'M16 × 60 Fasteners Set (Standard Pack)', 'Set', 'n2_m16_fast'],
              [16, 'M12 × 60 Fasteners Set (Standard Pack)', 'Set', 'n2_m12_fast'],
            ] as [number, string, string, keyof FormData][]).map(([sno, desc, uom, key]) => (
              <MaterialRow key={key} sno={sno} desc={desc} uom={uom} value={fv(key)} onChange={v => setForm(p => ({ ...p, [key]: v }))} />
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Section 9: Air Release System ────────────────────────────────── */}
      <div style={card}>
        <SectionTitle title="Air Release System" />
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th style={thStyle}>S.No.</th><th style={thStyle}>Description</th><th style={{ ...thStyle, textAlign: 'center' }}>UOM</th><th style={{ ...thStyle, textAlign: 'right', width: 100 }}>Qty</th></tr></thead>
          <tbody>
            <MaterialRow sno={1} desc='Air releaser with reducer for 3" oil drain pipe line' value={fv('air_3inch')} onChange={v => setForm(p => ({ ...p, air_3inch: v }))} />
            <MaterialRow sno={2} desc='Air releaser with reducer for N2 pipe line (1" pipe line)' value={fv('air_1inch')} onChange={v => setForm(p => ({ ...p, air_1inch: v }))} />
          </tbody>
        </table>
      </div>

      {/* ── Section 10: Final Cables ──────────────────────────────────────── */}
      <div style={card}>
        <SectionTitle title="Cables" />
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th style={thStyle}>S.No.</th><th style={thStyle}>Description</th><th style={{ ...thStyle, textAlign: 'center' }}>UOM</th><th style={{ ...thStyle, textAlign: 'right', width: 100 }}>Length</th></tr></thead>
          <tbody>
            {([
              [1, '19 Core Cable 1.5 Sq. mm', 'm', 'fc_19core'],
              [2, 'LHD Cable', 'm', 'fc_lhd'],
              [3, '3 Core Cable 1.5 Sq. mm', 'm', 'fc_3core'],
              [4, '2 Core Cable 1.5 Sq. mm (FS)', 'm', 'fc_2core'],
            ] as [number, string, string, keyof FormData][]).map(([sno, desc, uom, key]) => (
              <MaterialRow key={key} sno={sno} desc={desc} uom={uom} value={fv(key)} onChange={v => setForm(p => ({ ...p, [key]: v }))} />
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Section 11: Signatures ────────────────────────────────────────── */}
      <div style={card}>
        <SectionTitle title="Signatures" />
        <div style={{ padding: 18, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          <div style={{ border: '1px solid var(--gm)', borderRadius: 8, padding: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--tx)', marginBottom: 14 }}>Customer</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <Field lbl="Name"><input style={fi} value={fv('sig_cust_name')} onChange={f('sig_cust_name')} placeholder="Customer name" /></Field>
              <Field lbl="Phone no."><input style={fi} value={fv('sig_cust_phone')} onChange={f('sig_cust_phone')} placeholder="+91 XXXXXXXXXX" /></Field>
              <div>
                <label style={label}>Signature</label>
                <div style={{ height: 60, border: '1.5px dashed var(--gm)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--txm)', fontSize: 11 }}>Signature box (coming soon)</div>
              </div>
            </div>
          </div>
          <div style={{ border: '1px solid var(--gm)', borderRadius: 8, padding: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--tx)', marginBottom: 14 }}>EMR</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <Field lbl="Name"><input style={fi} value={fv('sig_emr_name')} onChange={f('sig_emr_name')} placeholder="EMR engineer name" /></Field>
              <Field lbl="Phone no."><input style={fi} value={fv('sig_emr_phone')} onChange={f('sig_emr_phone')} placeholder="+91 XXXXXXXXXX" /></Field>
              <div>
                <label style={label}>Signature</label>
                <div style={{ height: 60, border: '1.5px dashed var(--gm)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--txm)', fontSize: 11 }}>Signature box (coming soon)</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
