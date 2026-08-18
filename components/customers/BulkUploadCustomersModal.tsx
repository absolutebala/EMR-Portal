'use client'

import { useState, useRef } from 'react'
import * as XLSX from 'xlsx'
import Modal from '@/components/ui/Modal'
import { bulkImportCustomers, type BulkCustomerRow, type BulkCustomerResult } from '@/app/actions/bulk-import-customers'

const VALID_WARRANTY = ['under_warranty', 'expired', 'amc']
// Real-world sheets say "Yes"/"Y"/"Active" for an in-warranty unit far more often than
// they spell out our internal enum value — normalized to under_warranty rather than
// rejecting the row over it.
const WARRANTY_ALIASES: Record<string, string> = {
  yes: 'under_warranty', y: 'under_warranty', active: 'under_warranty', true: 'under_warranty',
  no: 'expired', n: 'expired', lapsed: 'expired',
}

const TEMPLATE_HEADERS = [
  'Customer Name', 'End Customer Type', 'Contact Person', 'Phone', 'Email', 'WhatsApp Number', 'Address', 'Pincode',
  'Site Name', 'Site Address', 'Serial Number', 'Year of Manufacture', 'Warranty Status',
]
const TEMPLATE_EXAMPLE = [
  ['Acme Steel', 'OEM', 'Ravi Kumar', '+91 9876543210', 'ravi@acmesteel.com', '+91 9876543210', '123 Industrial Rd, Chennai', '600001', 'Plant 1', '123 Industrial Rd, Chennai', 'SN-00001', '2018', 'under_warranty'],
  ['TANGEDCO', 'Solar', 'Priya S', '+91 9876543211', '', '', 'Anna Salai, Chennai', '600002', 'Substation A', 'Anna Salai, Chennai', 'SN-00002', '2020', 'amc'],
]

interface Props {
  open: boolean
  onClose: () => void
  onSaved: () => void
}

type Step = 'upload' | 'preview' | 'results'

interface ParsedRow extends BulkCustomerRow { _error?: string }

function downloadTemplate() {
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet([TEMPLATE_HEADERS, ...TEMPLATE_EXAMPLE])
  ws['!cols'] = TEMPLATE_HEADERS.map(() => ({ wch: 22 }))
  XLSX.utils.book_append_sheet(wb, ws, 'Customers')
  XLSX.writeFile(wb, 'emr_customer_import_template.xlsx')
}

export default function BulkUploadCustomersModal({ open, onClose, onSaved }: Props) {
  const [step, setStep] = useState<Step>('upload')
  const [rows, setRows] = useState<ParsedRow[]>([])
  const [results, setResults] = useState<BulkCustomerResult[]>([])
  const [loading, setLoading] = useState(false)
  const [fileError, setFileError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  function reset() {
    setStep('upload')
    setRows([])
    setResults([])
    setFileError('')
    setLoading(false)
  }

  function handleClose() { reset(); onClose() }

  function parseFile(file: File) {
    setFileError('')
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer)
        const wb = XLSX.read(data, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const raw: string[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })

        const headerIdx = raw.findIndex(r => r.some(c => String(c).toLowerCase().includes('customer') || String(c).toLowerCase().includes('serial')))
        if (headerIdx === -1) { setFileError('Could not find header row. Please use the provided template.'); return }

        const headers = raw[headerIdx].map(h => String(h).toLowerCase().trim())
        const col = (name: string) => headers.findIndex(h => h.includes(name))
        // Matches header text against several acceptable spellings/synonyms at once —
        // real customer-provided sheets rarely use our exact template wording (e.g.
        // "Warrenty Status" instead of "Warranty Status", "Project Name" instead of
        // "Site Name").
        const colAny = (names: string[]) => headers.findIndex(h => names.some(n => h.includes(n)))
        const colBothAny = (as: string[], b: string) => headers.findIndex(h => h.includes(b) && as.some(a => h.includes(a)))

        const iName = col('customer'),
          iEndType = colAny(['end customer type', 'customer type', 'type']),
          iContact = col('contact'), iPhone = col('phone'),
          iEmail = col('email'), iWhatsapp = col('whatsapp'),
          iAddress = colAny(['address']),
          iPincode = colAny(['pincode', 'pin code', 'postal code']),
          iSiteName = colBothAny(['site', 'project'], 'name'),
          iSiteAddress = colBothAny(['site', 'project'], 'address'),
          iSerial = col('serial'), iYear = col('year'),
          iWarranty = colAny(['warranty', 'warrenty'])

        const parsed: ParsedRow[] = raw.slice(headerIdx + 1)
          .filter(r => r.some(c => String(c).trim()))
          .map(r => {
            const warrantyRaw = String(r[iWarranty] || '').trim().toLowerCase()
            const warranty = VALID_WARRANTY.includes(warrantyRaw) ? warrantyRaw : (WARRANTY_ALIASES[warrantyRaw] || 'under_warranty')
            const pincode = String(r[iPincode] || '').trim()
            const row: ParsedRow = {
              name: String(r[iName] || '').trim(),
              end_customer_type_name: String(r[iEndType] || '').trim(),
              contact_person: String(r[iContact] || '').trim(),
              phone: String(r[iPhone] || '').trim(),
              email: String(r[iEmail] || '').trim(),
              whatsapp_number: String(r[iWhatsapp] || '').trim(),
              address: String(r[iAddress] || '').trim(),
              pincode,
              site_name: String(r[iSiteName] || '').trim(),
              site_address: String(r[iSiteAddress] || '').trim(),
              serial_number: String(r[iSerial] || '').trim(),
              year_of_manufacture: String(r[iYear] || '').trim(),
              warranty_status: warranty,
            }
            if (!row.name) row._error = 'Missing customer name'
            else if (!row.contact_person) row._error = 'Missing contact person'
            else if (!row.phone) row._error = 'Missing phone'
            else if (!row.serial_number) row._error = 'Missing serial number'
            else if (pincode && !/^\d{6}$/.test(pincode)) row._error = `Invalid pincode: "${pincode}"`
            else if (!row.site_address && !row.address) row._error = 'Missing address (or site address)'
            return row
          })

        if (parsed.length === 0) { setFileError('No data rows found in the file.'); return }
        setRows(parsed)
        setStep('preview')
      } catch {
        setFileError('Failed to read file. Please use the provided template.')
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
    const res = await bulkImportCustomers(valid)
    setResults(res)
    setLoading(false)
    setStep('results')
    onSaved()
  }

  const validRows = rows.filter(r => !r._error)
  const invalidRows = rows.filter(r => r._error)
  const successResults = results.filter(r => r.status === 'success')
  const failResults = results.filter(r => r.status === 'error')

  const footer = step === 'upload' ? (
    <button onClick={handleClose} style={{ padding: '8px 14px', borderRadius: 7, border: '1px solid var(--gm)', background: '#fff', cursor: 'pointer', fontSize: 12, fontFamily: 'Poppins,sans-serif' }}>Cancel</button>
  ) : step === 'preview' ? (
    <>
      <button onClick={reset} style={{ padding: '8px 14px', borderRadius: 7, border: '1px solid var(--gm)', background: '#fff', cursor: 'pointer', fontSize: 12, fontFamily: 'Poppins,sans-serif' }}>← Back</button>
      <button onClick={handleCreate} disabled={loading || validRows.length === 0} style={{ padding: '8px 16px', borderRadius: 7, border: 'none', background: 'var(--m)', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 500, fontFamily: 'Poppins,sans-serif', opacity: (loading || validRows.length === 0) ? .7 : 1 }}>
        {loading ? 'Creating customers…' : `Create ${validRows.length} customer${validRows.length !== 1 ? 's' : ''}`}
      </button>
    </>
  ) : (
    <button onClick={handleClose} style={{ padding: '8px 18px', borderRadius: 7, border: 'none', background: 'var(--m)', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 500, fontFamily: 'Poppins,sans-serif' }}>Done</button>
  )

  return (
    <Modal open={open} onClose={handleClose} title="Bulk customer upload" size="xl" footer={footer}>

      {/* STEP 1 — Upload */}
      {step === 'upload' && (
        <div>
          <div style={{ background: 'var(--mp)', border: '1px solid var(--mb)', borderRadius: 10, padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--tx)' }}>Download the import template</div>
              <div style={{ fontSize: 11, color: 'var(--txm)', marginTop: 2 }}>Fill in the Excel sheet and upload it below</div>
            </div>
            <button onClick={downloadTemplate} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 7, border: '1px solid var(--mb)', background: '#fff', color: 'var(--m)', cursor: 'pointer', fontSize: 12, fontWeight: 500, fontFamily: 'Poppins,sans-serif', whiteSpace: 'nowrap' }}>
              <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Download template
            </button>
          </div>

          <div
            onDragOver={e => e.preventDefault()}
            onDrop={onDrop}
            onClick={() => fileRef.current?.click()}
            style={{ border: '2px dashed var(--gm)', borderRadius: 10, padding: '36px 24px', textAlign: 'center', cursor: 'pointer', background: 'var(--gl)', transition: 'border-color .15s' }}
          >
            <svg width="36" height="36" fill="none" stroke="var(--txm)" strokeWidth="1.5" viewBox="0 0 24 24" style={{ margin: '0 auto 12px', display: 'block' }}>
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--tx)', marginBottom: 4 }}>Drag &amp; drop your Excel file here</div>
            <div style={{ fontSize: 11, color: 'var(--txm)' }}>or click to browse — .xlsx or .csv supported</div>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={onFileChange} style={{ display: 'none' }} />
          </div>

          {fileError && (
            <div style={{ marginTop: 12, background: '#FEE2E2', color: 'var(--red)', borderRadius: 8, padding: '10px 12px', fontSize: 12 }}>{fileError}</div>
          )}

          <div style={{ marginTop: 16, fontSize: 11, color: 'var(--txm)' }}>
            <span style={{ fontWeight: 600, color: 'var(--tx)' }}>Required columns: </span>
            Customer Name, Contact Person, Phone, Serial Number, and one of Address / Site Address
          </div>
          <div style={{ marginTop: 4, fontSize: 11, color: 'var(--txm)' }}>
            <span style={{ fontWeight: 600, color: 'var(--tx)' }}>End Customer Type: </span>free text (e.g. OEM, Solar) — new values are added automatically.
            <span style={{ fontWeight: 600, color: 'var(--tx)', marginLeft: 10 }}>Valid warranty status: </span>{VALID_WARRANTY.join(', ')} (Yes/No also accepted)
          </div>
        </div>
      )}

      {/* STEP 2 — Preview */}
      {step === 'preview' && (
        <div>
          <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
            <div style={{ flex: 1, background: '#D1FAE5', border: '1px solid #A7F3D0', borderRadius: 8, padding: '10px 14px' }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#065F46' }}>{validRows.length}</div>
              <div style={{ fontSize: 11, color: '#065F46' }}>Ready to import</div>
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
                  {['Customer', 'End Type', 'Contact', 'Phone', 'Serial No.', 'Warranty', 'Status'].map(h => (
                    <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: 'var(--txm)', borderBottom: '1px solid var(--gm)', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--gm)', background: r._error ? '#FFF5F5' : '' }}>
                    <td style={{ padding: '8px 12px', color: 'var(--tx)' }}>{r.name}</td>
                    <td style={{ padding: '8px 12px', color: 'var(--txm)' }}>{r.end_customer_type_name || '—'}</td>
                    <td style={{ padding: '8px 12px', color: 'var(--txm)' }}>{r.contact_person}</td>
                    <td style={{ padding: '8px 12px', color: 'var(--txm)' }}>{r.phone || '—'}</td>
                    <td style={{ padding: '8px 12px', color: 'var(--txm)' }}>{r.serial_number}</td>
                    <td style={{ padding: '8px 12px', color: 'var(--txm)' }}>{r.warranty_status}</td>
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

      {/* STEP 3 — Results */}
      {step === 'results' && (
        <div>
          <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
            <div style={{ flex: 1, background: '#D1FAE5', border: '1px solid #A7F3D0', borderRadius: 8, padding: '10px 14px' }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#065F46' }}>{successResults.length}</div>
              <div style={{ fontSize: 11, color: '#065F46' }}>Customers created</div>
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
                  ? <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 600, color: '#065F46', background: '#D1FAE5', padding: '3px 8px', borderRadius: 4 }}>Created</span>
                  : <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 600, color: '#DC2626', background: '#FEE2E2', padding: '3px 8px', borderRadius: 4 }}>Failed</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </Modal>
  )
}
