'use client'

import { useState, useRef } from 'react'
import * as XLSX from 'xlsx'
import Modal from '@/components/ui/Modal'
import { bulkImportCustomers, type BulkCustomerRow, type BulkCustomerResult } from '@/app/actions/bulk-import-customers'

const VALID_WARRANTY = ['under_warranty', 'expired', 'amc']
const WARRANTY_ALIASES: Record<string, string> = {
  yes: 'under_warranty', y: 'under_warranty', active: 'under_warranty', true: 'under_warranty',
  no: 'expired', n: 'expired', lapsed: 'expired',
}

// ---------- Small cell helpers ----------
type Cell = string | number | Date | null | undefined
const S = (v: Cell): string => (v == null ? '' : String(v).trim())
const toISO = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

// SAP bill dates arrive as Excel serials, dd.mm.yyyy, dd/mm/yyyy, or ISO. Day-first is
// assumed for the ambiguous numeric forms (SAP India convention).
function parseDateLoose(v: Cell): string {
  if (v == null || v === '') return ''
  if (v instanceof Date && !isNaN(v.getTime())) return toISO(v)
  const s = String(v).trim()
  if (!s) return ''
  if (/^\d{5}$/.test(s)) { const d = new Date(Math.round((parseInt(s, 10) - 25569) * 86400000)); if (!isNaN(d.getTime())) return toISO(d) }
  let m = s.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})$/)
  if (m) { const [, d, mo, yr] = m; const y = yr.length === 2 ? '20' + yr : yr; return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}` }
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (m) { const [, y, mo, d] = m; return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}` }
  const d2 = new Date(s); if (!isNaN(d2.getTime())) return toISO(d2)
  return ''
}

// "SN1000" → "SN1010" enumerates SN1000…SN1010 (11 units). Plain integers work too.
// Anything it can't safely enumerate falls back to keeping both endpoints, so no serial
// is silently dropped.
function expandSerials(from: string, to: string): string[] {
  from = from.trim(); to = to.trim()
  if (!from && !to) return []
  if (!from) return [to]
  if (!to || to === from) return [from]
  const mf = from.match(/^(.*?)(\d+)$/)
  const mt = to.match(/^(.*?)(\d+)$/)
  if (mf && mt && mf[1] === mt[1]) {
    const start = parseInt(mf[2], 10), end = parseInt(mt[2], 10)
    if (end >= start && end - start <= 5000) {
      const width = Math.max(mf[2].length, mt[2].length)
      const out: string[] = []
      for (let n = start; n <= end; n++) out.push(mf[1] + String(n).padStart(width, '0'))
      return out
    }
  }
  return [from, to]
}

// kV / Power / Poles into one human-readable rating. Power is labelled kVA (the common
// unit for this register — flag if a file ever uses MVA).
function composeRating(matDesc: string, kv: string, power: string, poles: string): string {
  const spec: string[] = []
  if (kv) spec.push(`${kv} kV`)
  if (power) spec.push(`${power} kVA`)
  if (poles) spec.push(`${poles}P`)
  return [matDesc, spec.join(', ')].filter(Boolean).join(' — ')
}

function buildNotes(pairs: [string, Cell][]): string {
  return pairs.map(([k, v]) => [k, S(v)] as const).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join(' | ')
}

function sanitizePincode(raw: string): string {
  const d = raw.replace(/\D/g, '')
  return /^\d{6}$/.test(d) ? d : ''
}

function headerIndexers(headers: string[]) {
  const has = (h: string, subs: string[]) => subs.some(s => h.includes(s))
  const idx = (...subs: string[]) => headers.findIndex(h => has(h, subs))
  const idxExact = (val: string) => headers.findIndex(h => h === val)
  const idxWhere = (pred: (h: string) => boolean) => headers.findIndex(pred)
  const allIdx = (...subs: string[]) => headers.map((h, i) => (has(h, subs) ? i : -1)).filter(i => i >= 0)
  return { idx, idxExact, idxWhere, allIdx }
}

type Raw = Cell[][]
type ParsedRow = BulkCustomerRow & { _error?: string }

// ---------- Format-specific parsers ----------
function findHeaderRow(raw: Raw, keywords: string[]): number {
  return raw.findIndex(r => r.some(c => { const s = String(c ?? '').toLowerCase(); return keywords.some(k => s.includes(k)) }))
}

function parseGeneric(raw: Raw): ParsedRow[] {
  const headerIdx = findHeaderRow(raw, ['customer', 'serial'])
  if (headerIdx === -1) throw new Error('header')
  const headers = raw[headerIdx].map(h => String(h ?? '').toLowerCase().trim())
  const { idx, idxWhere } = headerIndexers(headers)
  const iName = idx('customer'), iEnd = idx('end customer type', 'customer type', 'type'),
    iContact = idx('contact'), iPhone = idx('phone'), iEmail = idx('email'), iWhatsapp = idx('whatsapp'),
    iAddress = idx('address'), iPincode = idx('pincode', 'pin code', 'postal code'),
    iSiteName = idxWhere(h => (h.includes('site') || h.includes('project')) && h.includes('name')),
    iSiteAddr = idxWhere(h => (h.includes('site') || h.includes('project')) && h.includes('address')),
    iSerial = idx('serial'), iYear = idx('year'), iWarranty = idx('warranty', 'warrenty')
  return raw.slice(headerIdx + 1).filter(r => r.some(c => S(c))).map(r => {
    const warrantyRaw = S(r[iWarranty]).toLowerCase()
    const warranty = VALID_WARRANTY.includes(warrantyRaw) ? warrantyRaw : (WARRANTY_ALIASES[warrantyRaw] || 'under_warranty')
    const pincode = S(r[iPincode])
    const row: ParsedRow = {
      name: S(r[iName]), end_customer_type_name: S(r[iEnd]), contact_person: S(r[iContact]),
      phone: S(r[iPhone]), email: S(r[iEmail]), whatsapp_number: S(r[iWhatsapp]), address: S(r[iAddress]),
      pincode, site_name: S(r[iSiteName]), site_address: S(r[iSiteAddr]),
      serial_number: S(r[iSerial]), year_of_manufacture: S(r[iYear]), warranty_status: warranty,
    }
    if (pincode && !/^\d{6}$/.test(pincode)) row._error = `Invalid pincode: "${pincode}"`
    return row
  })
}

// OLTC: SAP customer master — one customer per row, no transformers.
function parseOltc(raw: Raw): ParsedRow[] {
  const headerIdx = findHeaderRow(raw, ['post', 'searchterm', 'search term', 'name 1'])
  if (headerIdx === -1) throw new Error('header')
  const headers = raw[headerIdx].map(h => String(h ?? '').toLowerCase().trim())
  const { idx, idxExact, allIdx } = headerIndexers(headers)
  const nameIdxs = allIdx('name')                 // "Name 1", "Name 1", "Name 2"
  const iCode = idxExact('customer')              // SAP account number (col A)
  const iSearch = idx('searchterm', 'search term')
  const iStreet = idx('street'), iCity = idx('city')
  const iRg = idxExact('rg') >= 0 ? idxExact('rg') : idx('region')
  const iPost = idx('post'), iEmail = idx('mail'), iPhone = idx('telephone', 'phone')
  return raw.slice(headerIdx + 1).filter(r => r.some(c => S(c))).map(r => {
    const name = nameIdxs.map(i => S(r[i])).filter(Boolean).join(' ')
    const street = S(r[iStreet])
    const city = iCity >= 0 ? S(r[iCity]) : ''
    const region = iRg >= 0 ? S(r[iRg]) : ''
    const siteAddress = [street, city, region].filter(Boolean).join(', ')
    return {
      name, sap_customer_code: iCode >= 0 ? S(r[iCode]) : '', contact_person: '',
      phone: iPhone >= 0 ? S(r[iPhone]) : '', email: iEmail >= 0 ? S(r[iEmail]) : '', whatsapp_number: '',
      address: street, city, region, search_term: iSearch >= 0 ? S(r[iSearch]) : '',
      pincode: sanitizePincode(S(r[iPost])), end_customer_type_name: '',
      site_name: name, site_address: siteAddress, serial_number: '', year_of_manufacture: '', warranty_status: 'under_warranty',
    } as ParsedRow
  }).filter(r => r.name || r.sap_customer_code)
}

// NIPS: sales/dispatch register — one customer + one transformer per serial in the range.
function parseNips(raw: Raw): ParsedRow[] {
  const headerIdx = findHeaderRow(raw, ['serial fro', 'material description', 'customer name'])
  if (headerIdx === -1) throw new Error('header')
  const headers = raw[headerIdx].map(h => String(h ?? '').toLowerCase().trim())
  const { idx, idxWhere } = headerIndexers(headers)
  const iName = idxWhere(h => h.includes('customer') && h.includes('name'))
  const iCode = idx('cus code', 'customer code')
  const iBill = idx('bill date', 'bill dt')
  const iPlant = idx('plant')
  const iMatDesc = idx('material description', 'description')
  const iMatCode = idxWhere(h => h.includes('material') && !h.includes('description'))
  const iPoles = idx('poles')
  const iKv = idxWhere(h => h === 'kv' || h.includes('kv'))
  const iPower = idx('power')
  const iEnd = idx('end user')
  const iFrom = idx('serial fro')
  const iTo = idx('serial to')
  const iQty = idx('invoice qt', 'quantity', 'qty')
  const iSales = idx('sales doc')
  const iOdn = idx('odn')
  const iPo = idxWhere(h => h.includes('purchase order') || h === 'po')
  const iRef = idx('your reference', 'reference')
  const iEmp = idx('employee')

  const out: ParsedRow[] = []
  for (const r of raw.slice(headerIdx + 1)) {
    if (!r.some(c => S(c))) continue
    const name = iName >= 0 ? S(r[iName]) : ''
    const sap = iCode >= 0 ? S(r[iCode]) : ''
    if (!name && !sap) continue
    const rating = composeRating(iMatDesc >= 0 ? S(r[iMatDesc]) : '', iKv >= 0 ? S(r[iKv]) : '', iPower >= 0 ? S(r[iPower]) : '', iPoles >= 0 ? S(r[iPoles]) : '')
    const notes = buildNotes([
      ['Sales Doc', iSales >= 0 ? r[iSales] : ''], ['ODN', iOdn >= 0 ? r[iOdn] : ''],
      ['PO', iPo >= 0 ? r[iPo] : ''], ['Ref', iRef >= 0 ? r[iRef] : ''],
      ['Invoice Qty', iQty >= 0 ? r[iQty] : ''], ['Employee', iEmp >= 0 ? r[iEmp] : ''],
      ['Material', iMatCode >= 0 ? r[iMatCode] : ''],
    ])
    const base: ParsedRow = {
      name, sap_customer_code: sap, contact_person: '', phone: '', email: '', whatsapp_number: '',
      address: '', pincode: '', end_customer_type_name: iEnd >= 0 ? S(r[iEnd]) : '',
      site_name: name, site_address: '', serial_number: '', year_of_manufacture: '', warranty_status: 'under_warranty',
      rating, manufacturer: iPlant >= 0 ? S(r[iPlant]) : '', dispatch_date: iBill >= 0 ? parseDateLoose(r[iBill]) : '', transformer_notes: notes,
    }
    const serials = expandSerials(iFrom >= 0 ? S(r[iFrom]) : '', iTo >= 0 ? S(r[iTo]) : '')
    if (serials.length === 0) out.push({ ...base })
    else for (const s of serials) out.push({ ...base, serial_number: s })
  }
  return out
}

export type UploadFormat = 'generic' | 'oltc' | 'nips'

interface FormatConfig {
  title: string
  filename: string
  headers: string[]
  example: (string)[][]
  attachToExisting: boolean
  hint: React.ReactNode
  parse: (raw: Raw) => ParsedRow[]
}

const FORMATS: Record<UploadFormat, FormatConfig> = {
  generic: {
    title: 'Bulk customer upload',
    filename: 'emr_customer_import_template.xlsx',
    headers: ['Customer Name', 'End Customer Type', 'Contact Person', 'Phone', 'Email', 'WhatsApp Number', 'Address', 'Pincode', 'Site Name', 'Site Address', 'Serial Number', 'Year of Manufacture', 'Warranty Status'],
    example: [
      ['Acme Steel', 'OEM', 'Ravi Kumar', '+91 9876543210', 'ravi@acmesteel.com', '+91 9876543210', '123 Industrial Rd, Chennai', '600001', 'Plant 1', '123 Industrial Rd, Chennai', 'SN-00001', '2018', 'under_warranty'],
      ['TANGEDCO', 'Solar', 'Priya S', '+91 9876543211', '', '', 'Anna Salai, Chennai', '600002', 'Substation A', 'Anna Salai, Chennai', 'SN-00002', '2020', 'amc'],
    ],
    attachToExisting: false,
    hint: <>All columns optional — fill in whatever you have. Rows are only skipped if a pincode is present but isn&apos;t 6 digits.</>,
    parse: parseGeneric,
  },
  oltc: {
    title: 'Bulk upload — OLTC (customer master)',
    filename: 'emr_oltc_customer_import_template.xlsx',
    headers: ['Customer', 'Name 1', 'Name 2', 'SearchTerm', 'Street', 'City', 'Post.Code', 'Rg', 'E-Mail Address', 'Telephone 1'],
    example: [
      ['100234', 'Bharat Heavy Electricals', 'BHEL Trichy Unit', 'BHEL', '12 GST Road', 'Tiruchirappalli', '620014', 'TN', 'contact@bhel.in', '+91 9876543210'],
      ['100235', 'Tamil Nadu Transmission Corp', '', 'TANTRANSCO', 'Anna Salai', 'Chennai', '600002', 'TN', '', '+91 9876543211'],
    ],
    attachToExisting: false,
    hint: <>SAP customer master layout — <b>Customer</b> (account no.), <b>Name 1/2</b>, <b>SearchTerm</b>, <b>Street</b>, <b>City</b>, <b>Post.Code</b>, <b>Rg</b>, <b>E-Mail</b>, <b>Telephone 1</b>. Creates customers only (no transformers). Non-6-digit postcodes are ignored, not rejected.</>,
    parse: parseOltc,
  },
  nips: {
    title: 'Bulk upload — NIPS (dispatch register)',
    filename: 'emr_nips_transformer_import_template.xlsx',
    headers: ['Customer Name', 'Cus Code', 'Employee', 'Sales Doc', 'ODN No', 'Bill Date', 'Plant', 'Material', 'Material Description', 'Poles', 'Purchase Order', 'kV', 'Power of transformer', 'Your Reference', 'End User', 'Serial From', 'Serial To', 'Invoice Qty'],
    example: [
      ['Adani Power', 'C10023', 'S. Rao', '5500012', 'ODN-9910', '15.03.2024', 'Unit-2', 'MAT-330', '33kV OLTC', '3', 'PO-88123', '33', '8000', 'REF-01', 'Utility', 'TX1000', 'TX1010', '11'],
      ['NTPC', 'C10024', 'K. Menon', '5500013', 'ODN-9911', '20.03.2024', 'Unit-1', 'MAT-110', '11kV OLTC', '3', 'PO-88124', '11', '2500', 'REF-02', 'Utility', 'TX2000', 'TX2000', '1'],
    ],
    attachToExisting: true,
    hint: <>Dispatch register — one transformer is created <b>per serial</b> between <b>Serial From</b> and <b>Serial To</b> (Invoice Qty units), all under one customer. kV / Power / Poles / Material Description become the rating; Bill Date → dispatch date; Plant → manufacturer; End User → end-customer type; Sales Doc / ODN / PO / Reference / Qty / Employee / Material are kept in the transformer&apos;s notes.</>,
    parse: parseNips,
  },
}

interface Props {
  open: boolean
  format: UploadFormat
  onClose: () => void
  onSaved: () => void
}

type Step = 'upload' | 'preview' | 'results'

function downloadTemplate(cfg: FormatConfig) {
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet([cfg.headers, ...cfg.example])
  ws['!cols'] = cfg.headers.map(() => ({ wch: 20 }))
  XLSX.utils.book_append_sheet(wb, ws, 'Import')
  XLSX.writeFile(wb, cfg.filename)
}

export default function BulkUploadCustomersModal({ open, format, onClose, onSaved }: Props) {
  const cfg = FORMATS[format]
  const [step, setStep] = useState<Step>('upload')
  const [rows, setRows] = useState<ParsedRow[]>([])
  const [results, setResults] = useState<BulkCustomerResult[]>([])
  const [loading, setLoading] = useState(false)
  const [fileError, setFileError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  function reset() { setStep('upload'); setRows([]); setResults([]); setFileError(''); setLoading(false) }
  function handleClose() { reset(); onClose() }

  function parseFile(file: File) {
    setFileError('')
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer)
        const wb = XLSX.read(data, { type: 'array', cellDates: true })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const raw = XLSX.utils.sheet_to_json<Cell[]>(ws, { header: 1, defval: '', raw: true })
        const parsed = cfg.parse(raw as Raw)
        if (parsed.length === 0) { setFileError('No data rows found in the file.'); return }
        setRows(parsed)
        setStep('preview')
      } catch (err) {
        setFileError(err instanceof Error && err.message === 'header'
          ? 'Could not find the header row. Please use the provided template for this department.'
          : 'Failed to read file. Please use the provided template.')
      }
    }
    reader.readAsArrayBuffer(file)
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) parseFile(file)
    e.target.value = ''
  }
  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    if (file) parseFile(file)
  }

  async function handleCreate() {
    const valid = rows.filter(r => !r._error)
    if (!valid.length) return
    setLoading(true)
    const res = await bulkImportCustomers(valid, { attachToExisting: cfg.attachToExisting })
    setResults(res)
    setLoading(false)
    setStep('results')
    onSaved()
  }

  const validRows = rows.filter(r => !r._error)
  const invalidRows = rows.filter(r => r._error)
  const successResults = results.filter(r => r.status === 'success')
  const failResults = results.filter(r => r.status === 'error')
  const transformerCount = validRows.filter(r => r.serial_number).length

  const footer = step === 'upload' ? (
    <button onClick={handleClose} style={{ padding: '8px 14px', borderRadius: 7, border: '1px solid var(--gm)', background: '#fff', cursor: 'pointer', fontSize: 12, fontFamily: 'Poppins,sans-serif' }}>Cancel</button>
  ) : step === 'preview' ? (
    <>
      <button onClick={reset} style={{ padding: '8px 14px', borderRadius: 7, border: '1px solid var(--gm)', background: '#fff', cursor: 'pointer', fontSize: 12, fontFamily: 'Poppins,sans-serif' }}>← Back</button>
      <button onClick={handleCreate} disabled={loading || validRows.length === 0} style={{ padding: '8px 16px', borderRadius: 7, border: 'none', background: 'var(--m)', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 500, fontFamily: 'Poppins,sans-serif', opacity: (loading || validRows.length === 0) ? .7 : 1 }}>
        {loading ? 'Importing…' : `Import ${validRows.length} row${validRows.length !== 1 ? 's' : ''}`}
      </button>
    </>
  ) : (
    <button onClick={handleClose} style={{ padding: '8px 18px', borderRadius: 7, border: 'none', background: 'var(--m)', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 500, fontFamily: 'Poppins,sans-serif' }}>Done</button>
  )

  return (
    <Modal open={open} onClose={handleClose} title={cfg.title} size="xl" footer={footer}>

      {step === 'upload' && (
        <div>
          <div style={{ background: 'var(--mp)', border: '1px solid var(--mb)', borderRadius: 10, padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--tx)' }}>Download the import template</div>
              <div style={{ fontSize: 11, color: 'var(--txm)', marginTop: 2 }}>Fill in the Excel sheet and upload it below</div>
            </div>
            <button onClick={() => downloadTemplate(cfg)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 7, border: '1px solid var(--mb)', background: '#fff', color: 'var(--m)', cursor: 'pointer', fontSize: 12, fontWeight: 500, fontFamily: 'Poppins,sans-serif', whiteSpace: 'nowrap' }}>
              <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Download template
            </button>
          </div>

          <div
            onDragOver={e => e.preventDefault()}
            onDrop={onDrop}
            onClick={() => fileRef.current?.click()}
            style={{ border: '2px dashed var(--gm)', borderRadius: 10, padding: '36px 24px', textAlign: 'center', cursor: 'pointer', background: 'var(--gl)' }}
          >
            <svg width="36" height="36" fill="none" stroke="var(--txm)" strokeWidth="1.5" viewBox="0 0 24 24" style={{ margin: '0 auto 12px', display: 'block' }}>
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--tx)', marginBottom: 4 }}>Drag &amp; drop your Excel file here</div>
            <div style={{ fontSize: 11, color: 'var(--txm)' }}>or click to browse — .xlsx or .csv supported</div>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={onFileChange} style={{ display: 'none' }} />
          </div>

          {fileError && <div style={{ marginTop: 12, background: '#FEE2E2', color: 'var(--red)', borderRadius: 8, padding: '10px 12px', fontSize: 12 }}>{fileError}</div>}

          <div style={{ marginTop: 16, fontSize: 11, color: 'var(--txm)', lineHeight: 1.6 }}>{cfg.hint}</div>
        </div>
      )}

      {step === 'preview' && (
        <div>
          <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
            <div style={{ flex: 1, background: '#D1FAE5', border: '1px solid #A7F3D0', borderRadius: 8, padding: '10px 14px' }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#065F46' }}>{validRows.length}</div>
              <div style={{ fontSize: 11, color: '#065F46' }}>Rows ready{transformerCount > 0 ? ` · ${transformerCount} transformer${transformerCount !== 1 ? 's' : ''}` : ''}</div>
            </div>
            {invalidRows.length > 0 && (
              <div style={{ flex: 1, background: '#FEE2E2', border: '1px solid #FECACA', borderRadius: 8, padding: '10px 14px' }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#991B1B' }}>{invalidRows.length}</div>
                <div style={{ fontSize: 11, color: '#991B1B' }}>Rows with errors (will be skipped)</div>
              </div>
            )}
          </div>

          <div style={{ maxHeight: 340, overflowY: 'auto', border: '1px solid var(--gm)', borderRadius: 8 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr style={{ background: '#FAFAFA', position: 'sticky', top: 0 }}>
                  {['Customer', 'SAP Code', 'Serial No.', 'Rating', 'End Type', 'Status'].map(h => (
                    <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: 'var(--txm)', borderBottom: '1px solid var(--gm)', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--gm)', background: r._error ? '#FFF5F5' : '' }}>
                    <td style={{ padding: '8px 12px', color: 'var(--tx)' }}>{r.name || '—'}</td>
                    <td style={{ padding: '8px 12px', color: 'var(--txm)' }}>{r.sap_customer_code || '—'}</td>
                    <td style={{ padding: '8px 12px', color: 'var(--txm)' }}>{r.serial_number || '—'}</td>
                    <td style={{ padding: '8px 12px', color: 'var(--txm)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.rating || '—'}</td>
                    <td style={{ padding: '8px 12px', color: 'var(--txm)' }}>{r.end_customer_type_name || '—'}</td>
                    <td style={{ padding: '8px 12px' }}>
                      {r._error
                        ? <span style={{ color: '#DC2626', fontSize: 10 }}>⚠ {r._error}</span>
                        : <span style={{ color: '#059669', fontSize: 10 }}>✓ Ready</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {step === 'results' && (
        <div>
          <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
            <div style={{ flex: 1, background: '#D1FAE5', border: '1px solid #A7F3D0', borderRadius: 8, padding: '10px 14px' }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#065F46' }}>{successResults.length}</div>
              <div style={{ fontSize: 11, color: '#065F46' }}>Imported</div>
            </div>
            {failResults.length > 0 && (
              <div style={{ flex: 1, background: '#FEE2E2', border: '1px solid #FECACA', borderRadius: 8, padding: '10px 14px' }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#991B1B' }}>{failResults.length}</div>
                <div style={{ fontSize: 11, color: '#991B1B' }}>Failed</div>
              </div>
            )}
          </div>

          <div style={{ maxHeight: 360, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {results.map((r, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: r.status === 'success' ? '#F0FDF4' : '#FFF5F5', border: `1px solid ${r.status === 'success' ? '#BBF7D0' : '#FECACA'}`, borderRadius: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--tx)' }}>{r.name}</div>
                  {r.status === 'error' && <div style={{ fontSize: 10, color: '#DC2626', marginTop: 2 }}>{r.error}</div>}
                </div>
                {r.status === 'success'
                  ? <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 600, color: '#065F46', background: '#D1FAE5', padding: '3px 8px', borderRadius: 4 }}>Imported</span>
                  : <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 600, color: '#DC2626', background: '#FEE2E2', padding: '3px 8px', borderRadius: 4 }}>Failed</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </Modal>
  )
}
