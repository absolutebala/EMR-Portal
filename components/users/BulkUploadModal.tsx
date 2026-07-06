'use client'

import { useState, useRef } from 'react'
import * as XLSX from 'xlsx'
import Modal from '@/components/ui/Modal'
import { bulkInviteUsers, type BulkUserRow, type BulkInviteResult } from '@/app/actions/bulk-invite'

const VALID_ROLES = ['Super Admin', 'Service Manager', 'Service Engineer', 'Sales Executive Engineer', 'Inventory Team', 'Dispatch Team', 'Reporting Team']

const TEMPLATE_HEADERS = ['First Name', 'Last Name', 'Employee ID', 'Email', 'Phone', 'Role']
const TEMPLATE_EXAMPLE = [
  ['John', 'Doe', 'EMP-00001', 'john@emrglobal.com', '+91 9876543210', 'Service Engineer'],
  ['Jane', 'Smith', 'EMP-00002', 'jane@emrglobal.com', '+91 9876543211', 'Service Manager'],
]

interface Props {
  open: boolean
  onClose: () => void
  onSaved: () => void
}

type Step = 'upload' | 'preview' | 'results'

interface ParsedRow extends BulkUserRow { _error?: string }

function downloadTemplate() {
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet([TEMPLATE_HEADERS, ...TEMPLATE_EXAMPLE])
  ws['!cols'] = TEMPLATE_HEADERS.map(() => ({ wch: 22 }))
  XLSX.utils.book_append_sheet(wb, ws, 'Users')
  XLSX.writeFile(wb, 'emr_user_import_template.xlsx')
}

export default function BulkUploadModal({ open, onClose, onSaved }: Props) {
  const [step, setStep] = useState<Step>('upload')
  const [rows, setRows] = useState<ParsedRow[]>([])
  const [results, setResults] = useState<BulkInviteResult[]>([])
  const [loading, setLoading] = useState(false)
  const [fileError, setFileError] = useState('')
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null)
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

        // Find header row
        const headerIdx = raw.findIndex(r => r.some(c => String(c).toLowerCase().includes('first') || String(c).toLowerCase().includes('employee')))
        if (headerIdx === -1) { setFileError('Could not find header row. Please use the provided template.'); return }

        const headers = raw[headerIdx].map(h => String(h).toLowerCase().trim())
        const col = (name: string) => headers.findIndex(h => h.includes(name))

        const iFirst = col('first'), iLast = col('last'), iEmp = col('employee'), iEmail = col('email'), iPhone = col('phone'), iRole = col('role')

        const parsed: ParsedRow[] = raw.slice(headerIdx + 1)
          .filter(r => r.some(c => String(c).trim()))
          .map(r => {
            const row: ParsedRow = {
              first_name: String(r[iFirst] || '').trim(),
              last_name: String(r[iLast] || '').trim(),
              employee_id: String(r[iEmp] || '').trim(),
              email: String(r[iEmail] || '').trim(),
              phone: String(r[iPhone] || '').trim(),
              role: String(r[iRole] || '').trim(),
            }
            if (!row.first_name || !row.last_name) row._error = 'Missing name'
            else if (!row.employee_id) row._error = 'Missing employee ID'
            else if (!row.email || !row.email.includes('@')) row._error = 'Invalid email'
            else if (!VALID_ROLES.includes(row.role)) row._error = `Invalid role: "${row.role}"`
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
    const res = await bulkInviteUsers(valid)
    setResults(res)
    setLoading(false)
    setStep('results')
    onSaved()
  }

  async function copyLink(link: string, idx: number) {
    await navigator.clipboard.writeText(link)
    setCopiedIdx(idx)
    setTimeout(() => setCopiedIdx(null), 2500)
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
        {loading ? 'Creating accounts…' : `Create ${validRows.length} account${validRows.length !== 1 ? 's' : ''}`}
      </button>
    </>
  ) : (
    <button onClick={handleClose} style={{ padding: '8px 18px', borderRadius: 7, border: 'none', background: 'var(--m)', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 500, fontFamily: 'Poppins,sans-serif' }}>Done</button>
  )

  return (
    <Modal open={open} onClose={handleClose} title="Bulk user upload" size="xl" footer={footer}>

      {/* STEP 1 — Upload */}
      {step === 'upload' && (
        <div>
          {/* Template download */}
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

          {/* Drop zone */}
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

          {/* Required columns */}
          <div style={{ marginTop: 16, fontSize: 11, color: 'var(--txm)' }}>
            <span style={{ fontWeight: 600, color: 'var(--tx)' }}>Required columns: </span>
            {TEMPLATE_HEADERS.join(', ')}
          </div>
          <div style={{ marginTop: 4, fontSize: 11, color: 'var(--txm)' }}>
            <span style={{ fontWeight: 600, color: 'var(--tx)' }}>Valid roles: </span>
            {VALID_ROLES.join(', ')}
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
                  {['Name', 'Employee ID', 'Email', 'Phone', 'Role', 'Status'].map(h => (
                    <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: 'var(--txm)', borderBottom: '1px solid var(--gm)', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--gm)', background: r._error ? '#FFF5F5' : '' }}>
                    <td style={{ padding: '8px 12px', color: 'var(--tx)' }}>{r.first_name} {r.last_name}</td>
                    <td style={{ padding: '8px 12px', color: 'var(--txm)' }}>{r.employee_id}</td>
                    <td style={{ padding: '8px 12px', color: 'var(--txm)' }}>{r.email}</td>
                    <td style={{ padding: '8px 12px', color: 'var(--txm)' }}>{r.phone || '—'}</td>
                    <td style={{ padding: '8px 12px', color: 'var(--txm)' }}>{r.role}</td>
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
              <div style={{ fontSize: 11, color: '#065F46' }}>Accounts created</div>
            </div>
            {failResults.length > 0 && (
              <div style={{ flex: 1, background: '#FEE2E2', border: '1px solid #FECACA', borderRadius: 8, padding: '10px 14px' }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#991B1B' }}>{failResults.length}</div>
                <div style={{ fontSize: 11, color: '#991B1B' }}>Failed</div>
              </div>
            )}
          </div>

          <div style={{ fontSize: 11, color: 'var(--txm)', marginBottom: 10 }}>Copy and share each invite link individually with the user.</div>

          <div style={{ maxHeight: 360, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {results.map((r, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: r.status === 'success' ? '#F0FDF4' : '#FFF5F5', border: `1px solid ${r.status === 'success' ? '#BBF7D0' : '#FECACA'}`, borderRadius: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--tx)' }}>{r.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--txm)' }}>{r.email}</div>
                  {r.status === 'error' && <div style={{ fontSize: 10, color: '#DC2626', marginTop: 2 }}>{r.error}</div>}
                </div>
                {r.status === 'success' && r.inviteLink && (
                  <button
                    onClick={() => copyLink(r.inviteLink!, i)}
                    style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 6, border: '1px solid var(--gm)', background: copiedIdx === i ? '#D1FAE5' : '#fff', color: copiedIdx === i ? '#065F46' : 'var(--tx)', cursor: 'pointer', fontSize: 11, fontWeight: 500, fontFamily: 'Poppins,sans-serif', whiteSpace: 'nowrap' }}
                  >
                    {copiedIdx === i
                      ? <>✓ Copied</>
                      : <><svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg> Copy invite link</>
                    }
                  </button>
                )}
                {r.status === 'error' && (
                  <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 600, color: '#DC2626', background: '#FEE2E2', padding: '3px 8px', borderRadius: 4 }}>Failed</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </Modal>
  )
}
