import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { getAuthedUser } from '@/lib/cognito/server'
import { getComplaintReports } from '@/app/actions/get-reports'
import { reportStatusGroup } from '@/lib/reports'
import { PdfBuilder } from '@/lib/mobile/docPdfKit'

export const runtime = 'nodejs'

const STATUS_LABEL: Record<string, string> = { open: 'Open', in_progress: 'In Progress', closed: 'Closed' }
const INFO_NOTE = 'This report includes all complaints with current status, customer details, site information and assigned engineer.'

function fmtDate(d: string | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

// GET /api/reports/export?format=xlsx|pdf&tab=all|open|in_progress|closed&search=&from=&to=
// Exports EVERY complaint matching the current table filters (status tab + search + date
// range) — all pages, not just the visible one — rebuilt server-side from the same
// dept-scoped data the Reports page uses.
export async function GET(req: NextRequest) {
  const user = await getAuthedUser()
  if (!user) return new NextResponse('Not authenticated', { status: 401 })

  const sp = req.nextUrl.searchParams
  const format = sp.get('format') === 'pdf' ? 'pdf' : 'xlsx'
  const tab = sp.get('tab') || 'all'
  const search = (sp.get('search') || '').trim().toLowerCase()
  const from = sp.get('from') || ''
  const to = sp.get('to') || ''

  const { rows, error } = await getComplaintReports()
  if (error) return new NextResponse(error, { status: 500 })

  // Same filtering the client applies to the table, so the export matches what's shown.
  const matched = rows
    .filter(r => tab === 'all' || reportStatusGroup(r.status) === tab)
    .filter(r => !search || `${r.woNumber} ${r.ticketNumber} ${r.customerName} ${r.siteName} ${r.engineerName}`.toLowerCase().includes(search))
    .filter(r => !from || (r.complaintDate && r.complaintDate.slice(0, 10) >= from))
    .filter(r => !to || (r.complaintDate && r.complaintDate.slice(0, 10) <= to))
    .sort((a, b) => (a.complaintDate && b.complaintDate ? (a.complaintDate < b.complaintDate ? 1 : -1) : 0))

  const header = ['#', 'Notification No.', 'Customer Name', 'Site', 'Engineer', 'Customer Issue', 'Status', 'Complaint Date']
  const body = matched.map((r, i) => [
    String(i + 1), r.woNumber, r.customerName, r.siteName, r.engineerName,
    r.customerIssue, STATUS_LABEL[reportStatusGroup(r.status)], fmtDate(r.complaintDate),
  ])

  const scopeBits: string[] = []
  if (tab !== 'all') scopeBits.push(STATUS_LABEL[tab] || tab)
  if (from || to) scopeBits.push(`${from ? fmtDate(from) : '…'} – ${to ? fmtDate(to) : '…'}`)
  if (search) scopeBits.push(`"${sp.get('search')}"`)
  const scopeLabel = scopeBits.length ? scopeBits.join(' · ') : 'All complaints'
  const fnameRange = from || to ? `${from || 'start'}_to_${to || 'end'}` : 'all'

  if (format === 'xlsx') {
    const aoa: string[][] = [['Complaints Report'], [scopeLabel], [INFO_NOTE], [], header, ...body]
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    ws['!cols'] = [{ wch: 5 }, { wch: 18 }, { wch: 26 }, { wch: 24 }, { wch: 22 }, { wch: 40 }, { wch: 13 }, { wch: 16 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Complaints')
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="complaints_${fnameRange}.xlsx"`,
      },
    })
  }

  const pdf = new PdfBuilder({ layout: 'landscape', margin: 32 })
  pdf.logoLeftWithPill('Complaints')
  // Reset x to the left margin on every line (logoLeftWithPill leaves pdfkit's cursor at
  // the pill on the right) and constrain to the page width so nothing wraps mid-header.
  pdf.doc.font('Helvetica-Bold').fontSize(14).fillColor('#1C0D14').text('Complaints Report', pdf.x0, pdf.y, { width: pdf.W })
  pdf.doc.font('Helvetica').fontSize(10).fillColor('#555').text(scopeLabel, pdf.x0, pdf.y, { width: pdf.W })
  pdf.gap(4)
  pdf.doc.font('Helvetica-Oblique').fontSize(8).fillColor('#777').text(INFO_NOTE, pdf.x0, pdf.y, { width: pdf.W })
  pdf.gap(10)
  const cols = [
    { header: '#', frac: 0.04 },
    { header: 'Notification No.', frac: 0.12 },
    { header: 'Customer Name', frac: 0.16 },
    { header: 'Site', frac: 0.15 },
    { header: 'Engineer', frac: 0.13 },
    { header: 'Customer Issue', frac: 0.22 },
    { header: 'Status', frac: 0.09 },
    { header: 'Complaint Date', frac: 0.09 },
  ]
  pdf.table(cols, body.length ? body : [['', '', 'No complaints match the current filters.', '', '', '', '', '']])
  const buf = await pdf.finish()
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="complaints_${fnameRange}.pdf"`,
    },
  })
}
