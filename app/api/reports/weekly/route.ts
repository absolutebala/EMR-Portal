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

// GET /api/reports/weekly?format=xlsx|pdf&from=YYYY-MM-DD&to=YYYY-MM-DD
// Builds the weekly complaints report server-side from the same dept-scoped data the
// Reports page uses, so the file always reflects authoritative data for the requester.
export async function GET(req: NextRequest) {
  const user = await getAuthedUser()
  if (!user) return new NextResponse('Not authenticated', { status: 401 })

  const sp = req.nextUrl.searchParams
  const format = sp.get('format') === 'pdf' ? 'pdf' : 'xlsx'
  const from = sp.get('from') || ''
  const to = sp.get('to') || ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return new NextResponse('Invalid week range', { status: 400 })
  }

  const { rows, error } = await getComplaintReports()
  if (error) return new NextResponse(error, { status: 500 })

  // Complaint date = reported_date ?? created_at; keep rows whose date falls in the week.
  const weekRows = rows
    .filter(r => r.complaintDate && r.complaintDate.slice(0, 10) >= from && r.complaintDate.slice(0, 10) <= to)
    .sort((a, b) => (a.complaintDate! < b.complaintDate! ? 1 : -1))

  const header = ['#', 'Notification No.', 'Customer Name', 'Site', 'Engineer', 'Customer Issue', 'Status', 'Complaint Date']
  const body = weekRows.map((r, i) => [
    String(i + 1), r.woNumber, r.customerName, r.siteName, r.engineerName,
    r.customerIssue, STATUS_LABEL[reportStatusGroup(r.status)], fmtDate(r.complaintDate),
  ])
  const periodLabel = `${fmtDate(from)} – ${fmtDate(to)}`
  const safeRange = `${from}_to_${to}`

  if (format === 'xlsx') {
    const aoa: string[][] = [
      ['Complaints Report'],
      [`Week: ${periodLabel}`],
      [INFO_NOTE],
      [],
      header,
      ...body,
    ]
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    ws['!cols'] = [{ wch: 5 }, { wch: 18 }, { wch: 26 }, { wch: 24 }, { wch: 22 }, { wch: 40 }, { wch: 13 }, { wch: 16 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Complaints')
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="complaints_weekly_${safeRange}.xlsx"`,
      },
    })
  }

  // PDF (landscape — eight columns need the width).
  const pdf = new PdfBuilder({ layout: 'landscape', margin: 32 })
  pdf.logoLeftWithPill('Weekly Report')
  pdf.doc.font('Helvetica-Bold').fontSize(14).fillColor('#1C0D14').text('Complaints Report', { continued: false })
  pdf.doc.font('Helvetica').fontSize(10).fillColor('#555').text(`Week: ${periodLabel}`)
  pdf.gap(4)
  pdf.doc.font('Helvetica-Oblique').fontSize(8).fillColor('#777').text(INFO_NOTE, { width: pdf.W })
  pdf.gap(8)
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
  pdf.table(cols, body.length ? body : [['', '', 'No complaints in this week.', '', '', '', '', '']])
  const buf = await pdf.finish()
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="complaints_weekly_${safeRange}.pdf"`,
    },
  })
}
