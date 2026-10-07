import { NextRequest, NextResponse } from 'next/server'
import { getAuthedUser } from '@/lib/cognito/server'
import { getWorkOrderDetail } from '@/app/actions/get-work-orders'
import { reportStatusGroup, STATUS_GROUP_META } from '@/lib/reports'
import { JOB_TYPE_LABELS } from '@/components/mobile/constants'
import { PdfBuilder } from '@/lib/mobile/docPdfKit'

export const runtime = 'nodejs'

function fmtDate(d: string | null | undefined): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}
function fmtDateTime(d: string | null | undefined): string {
  if (!d) return '—'
  return new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
const VISIT_OUTCOME: Record<string, string> = { completed: 'Completed', pending: 'Pending', in_progress: 'In progress' }

// GET /api/reports/complaint/<id>?format=pdf
// A detailed single-complaint (notification) report — key details, the customer's
// issue, the visit history and the full activity/status history — no date-range line
// (it's an individual report, not a list).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthedUser()
  if (!user) return new NextResponse('Not authenticated', { status: 401 })
  const { id } = await params

  const { workOrder: wo, activity, visits, error } = await getWorkOrderDetail(id)
  if (error || !wo) return new NextResponse(error || 'Not found', { status: 404 })

  const statusMeta = STATUS_GROUP_META[reportStatusGroup(wo.status)]

  const pdf = new PdfBuilder({ margin: 40 })
  pdf.logoLeftWithPill('Complaint')

  pdf.doc.font('Helvetica-Bold').fontSize(16).fillColor('#1C0D14').text('Complaint Report', pdf.x0, pdf.y, { width: pdf.W })
  pdf.doc.font('Helvetica').fontSize(10).fillColor('#555').text(`Notification No. ${wo.wo_number}${wo.ticket_number ? `  ·  Complaint No. ${wo.ticket_number}` : ''}`, pdf.x0, pdf.y, { width: pdf.W })
  // Status pill.
  pdf.gap(6)
  {
    const label = statusMeta.label
    pdf.doc.font('Helvetica-Bold').fontSize(9)
    const tw = pdf.doc.widthOfString(label)
    const pw = tw + 20
    const y = pdf.y
    pdf.doc.roundedRect(pdf.x0, y, pw, 18, 9).fill(statusMeta.color)
    pdf.doc.fillColor('#fff').text(label, pdf.x0, y + 4.5, { width: pw, align: 'center' })
    pdf.doc.fillColor('#000')
    pdf.y = y + 18 + 10
  }

  // Key / value helper: label on the left, value to its right, advancing past the taller.
  const kv = (label: string, value: string | null | undefined) => {
    pdf.ensure(16)
    const y = pdf.y
    pdf.doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#666').text(label, pdf.x0, y, { width: 150 })
    const yLabel = pdf.doc.y
    pdf.doc.font('Helvetica').fontSize(9.5).fillColor('#1C0D14').text(value && String(value).trim() ? String(value) : '—', pdf.x0 + 155, y, { width: pdf.W - 155 })
    pdf.y = Math.max(yLabel, pdf.doc.y) + 3
  }

  const section = (title: string) => {
    pdf.ensure(26)
    pdf.gap(8)
    pdf.doc.font('Helvetica-Bold').fontSize(11).fillColor('#7D1D3F').text(title, pdf.x0, pdf.y, { width: pdf.W })
    pdf.doc.strokeColor('#E5D5DB').lineWidth(0.8).moveTo(pdf.x0, pdf.y + 1).lineTo(pdf.x0 + pdf.W, pdf.y + 1).stroke()
    pdf.gap(6)
  }

  section('Details')
  kv('Status', statusMeta.label)
  kv('Job Type', JOB_TYPE_LABELS[wo.job_type] || wo.job_type)
  kv('Customer', wo.customer_name || '—')
  kv('Site', wo.site_name || '—')
  kv('Engineer', wo.engineer_name || 'Unassigned')
  if (wo.customer_phone) kv('Customer Phone', wo.customer_phone)
  kv('Reported Date', fmtDate(wo.reported_date || wo.created_at))
  kv('Scheduled Date', fmtDate(wo.scheduled_date))
  kv('Created', fmtDateTime(wo.created_at))

  section('Customer Issue')
  pdf.doc.font('Helvetica').fontSize(9.5).fillColor('#1C0D14').text(wo.customer_message && wo.customer_message.trim() ? wo.customer_message : '—', pdf.x0, pdf.y, { width: pdf.W })
  pdf.y = pdf.doc.y

  if (visits && visits.length) {
    section('Visit History')
    for (const v of visits) {
      pdf.ensure(20)
      pdf.doc.font('Helvetica-Bold').fontSize(9).fillColor('#1C0D14').text(`${fmtDateTime(v.createdAt)}  ·  ${VISIT_OUTCOME[v.outcome] || v.outcome}  ·  ${v.engineerName}`, pdf.x0, pdf.y, { width: pdf.W })
      pdf.y = pdf.doc.y
      if (v.summary) {
        pdf.doc.font('Helvetica').fontSize(9).fillColor('#444').text(v.summary, pdf.x0 + 10, pdf.y, { width: pdf.W - 10 })
        pdf.y = pdf.doc.y
      }
      pdf.gap(4)
    }
  }

  section('Activity History')
  if (activity && activity.length) {
    for (const a of activity) {
      pdf.ensure(14)
      pdf.doc.font('Helvetica').fontSize(9).fillColor('#333').text(`${fmtDateTime(a.created_at)}  —  ${a.action}${a.actor_name ? `  (by ${a.actor_name})` : ''}`, pdf.x0, pdf.y, { width: pdf.W })
      pdf.y = pdf.doc.y + 2
    }
  } else {
    pdf.doc.font('Helvetica').fontSize(9).fillColor('#777').text('No activity recorded.', pdf.x0, pdf.y, { width: pdf.W })
    pdf.y = pdf.doc.y
  }

  const buf = await pdf.finish()
  const safeNo = (wo.wo_number || 'complaint').replace(/[^\w.\-]+/g, '_')
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="complaint_${safeNo}.pdf"`,
    },
  })
}
