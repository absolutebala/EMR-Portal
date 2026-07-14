import PDFDocument from 'pdfkit'

interface VisitPdfSection {
  title: string
  fields: { id: string; label: string; field_type: string }[]
  tables: { rows: { id: string; row_label: string; sno_label: string | null }[] }[]
}

export interface VisitPdfParams {
  woNumber: string
  jobType: string
  customerName: string
  serialNumbers: string
  engineerName: string
  clientName: string | null
  visitType: 'followup' | 'final'
  sections: VisitPdfSection[]
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

export function generateVisitPdf(params: VisitPdfParams): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 44 })
    const chunks: Buffer[] = []
    doc.on('data', c => chunks.push(c))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    doc.fontSize(17).text('EMR Global — Work Order Summary', { align: 'center' })
    doc.moveDown(0.5)
    doc.fontSize(10).fillColor('#555').text(
      params.visitType === 'final' ? 'Final visit summary' : 'Follow-up visit summary',
      { align: 'center' }
    )
    doc.moveDown(1.2)

    doc.fillColor('#000').fontSize(11)
    doc.text(`Work order: ${params.woNumber}`)
    doc.text(`Job type: ${params.jobType}`)
    doc.text(`Customer: ${params.customerName}`)
    doc.text(`Serial number(s): ${params.serialNumbers || '—'}`)
    doc.text(`Engineer: ${params.engineerName}`)
    doc.text(`Date: ${new Date().toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`)
    doc.moveDown(1)

    for (const sec of params.sections) {
      const textFields = sec.fields.filter(f => f.field_type !== 'signature' && f.field_type !== 'photo' && params.fieldValues[f.id])
      const answeredRows = sec.tables.flatMap(t => t.rows).filter(r => params.rowValues[r.id]?.status)
      if (textFields.length === 0 && answeredRows.length === 0) continue

      doc.fontSize(13).text(sec.title, { underline: true })
      doc.moveDown(0.3)
      doc.fontSize(10)
      for (const f of textFields) {
        doc.text(`${f.label}: ${params.fieldValues[f.id]}`)
      }
      for (const r of answeredRows) {
        const rv = params.rowValues[r.id]
        const prefix = r.sno_label ? `${r.sno_label}. ` : ''
        doc.text(`${prefix}${r.row_label}: ${rv.status}${rv.remarks ? ' — ' + rv.remarks : ''}`)
      }
      doc.moveDown(0.6)
    }

    doc.addPage()
    doc.fontSize(13).text('Sign-off', { underline: true })
    doc.moveDown(0.8)

    doc.fontSize(10).text(`Engineer: ${params.engineerName}`)
    doc.moveDown(0.3)
    const engBuf = params.engineerSignature ? dataUrlToBuffer(params.engineerSignature) : null
    if (engBuf) {
      try { doc.image(engBuf, { width: 160 }) } catch { /* skip if not a valid image */ }
    }
    doc.moveDown(1)

    doc.fontSize(10).text(`Client: ${params.clientName || '—'}`)
    doc.moveDown(0.3)
    const clientBuf = params.clientSignature ? dataUrlToBuffer(params.clientSignature) : null
    if (clientBuf) {
      try { doc.image(clientBuf, { width: 160 }) } catch { /* skip if not a valid image */ }
    }

    doc.end()
  })
}
