import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, ImageRun } from 'docx'

interface VisitWordSection {
  title: string
  fields: { id: string; label: string; field_type: string }[]
  tables: { rows: { id: string; row_label: string; sno_label: string | null }[] }[]
}

export interface VisitWordParams {
  woNumber: string
  jobType: string
  customerName: string
  serialNumbers: string
  engineerName: string
  clientName: string | null
  visitType: 'followup' | 'final'
  sections: VisitWordSection[]
  fieldValues: Record<string, string>
  rowValues: Record<string, { status: string; remarks: string }>
  engineerSignature: string | null
  clientSignature: string | null
}

function dataUrlToBuffer(dataUrl: string): Buffer | null {
  try {
    const base64 = dataUrl.split(',')[1] ?? dataUrl
    return Buffer.from(base64, 'base64')
  } catch {
    return null
  }
}

function signatureImage(dataUrl: string | null): Paragraph[] {
  const buf = dataUrl ? dataUrlToBuffer(dataUrl) : null
  if (!buf) return []
  try {
    return [new Paragraph({ children: [new ImageRun({ data: buf, transformation: { width: 160, height: 60 }, type: 'png' })] })]
  } catch {
    return []
  }
}

export async function generateVisitWord(params: VisitWordParams): Promise<Buffer> {
  const children: Paragraph[] = []

  children.push(new Paragraph({ text: 'EMR Global — Notification Summary', heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER }))
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: params.visitType === 'final' ? 'Final visit summary' : 'Follow-up visit summary', color: '555555' })],
  }))
  children.push(new Paragraph({ text: '' }))

  const meta: [string, string][] = [
    ['Notification', params.woNumber],
    ['Job type', params.jobType],
    ['Customer', params.customerName],
    ['Serial number(s)', params.serialNumbers || '—'],
    ['Engineer', params.engineerName],
    ['Date', new Date().toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })],
  ]
  for (const [label, value] of meta) {
    children.push(new Paragraph({ children: [new TextRun({ text: `${label}: `, bold: true }), new TextRun(value)] }))
  }
  children.push(new Paragraph({ text: '' }))

  for (const sec of params.sections) {
    const textFields = sec.fields.filter(f => f.field_type !== 'signature' && f.field_type !== 'photo' && params.fieldValues[f.id])
    const answeredRows = sec.tables.flatMap(t => t.rows).filter(r => params.rowValues[r.id]?.status)
    if (textFields.length === 0 && answeredRows.length === 0) continue

    children.push(new Paragraph({ text: sec.title, heading: HeadingLevel.HEADING_2 }))
    for (const f of textFields) {
      children.push(new Paragraph({ children: [new TextRun({ text: `${f.label}: `, bold: true }), new TextRun(params.fieldValues[f.id])] }))
    }
    for (const r of answeredRows) {
      const rv = params.rowValues[r.id]
      const prefix = r.sno_label ? `${r.sno_label}. ` : ''
      children.push(new Paragraph({ text: `${prefix}${r.row_label}: ${rv.status}${rv.remarks ? ' — ' + rv.remarks : ''}` }))
    }
    children.push(new Paragraph({ text: '' }))
  }

  children.push(new Paragraph({ text: 'Sign-off', heading: HeadingLevel.HEADING_2, pageBreakBefore: true }))
  children.push(new Paragraph({ children: [new TextRun({ text: `Engineer: `, bold: true }), new TextRun(params.engineerName)] }))
  children.push(...signatureImage(params.engineerSignature))
  children.push(new Paragraph({ text: '' }))
  children.push(new Paragraph({ children: [new TextRun({ text: `Client: `, bold: true }), new TextRun(params.clientName || '—')] }))
  children.push(...signatureImage(params.clientSignature))

  const doc = new Document({ sections: [{ children }] })
  return Packer.toBuffer(doc)
}
