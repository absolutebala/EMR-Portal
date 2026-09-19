import PDFDocument from 'pdfkit'

interface VisitPdfTable {
  statusType: string
  col1Label: string | null
  col2Label: string | null
  rows: { id: string; row_label: string; sno_label: string | null }[]
}
interface VisitPdfSection {
  title: string
  fields: { id: string; label: string; field_type: string; repeatable?: boolean }[]
  tables: VisitPdfTable[]
}

export interface VisitPdfParams {
  formName?: string
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

const MAROON = '#7D1D3F'
const BORDER = '#D8CDD3'
const HEAD_BG = '#F1E7EB'
const INK = '#1C0D14'
const MUTED = '#7A6870'

function dataUrlToBuffer(dataUrl: string): Buffer | null {
  try {
    const base64 = dataUrl.split(',')[1] ?? dataUrl
    return Buffer.from(base64, 'base64')
  } catch {
    return null
  }
}

// Maps a stored row status code to the human label the on-screen form shows, so the
// document reads the same as what the engineer selected in the app.
function statusLabel(code: string, col1Label: string | null, col2Label: string | null): string {
  switch (code) {
    case 'yes': return 'Yes'
    case 'no': return 'No'
    case 'tested': return 'Tested'
    case 'not_tested': return 'Not Tested'
    case 'progress': return 'In Progress'
    case 'completed': return 'Completed'
    case 'na': return 'N/A'
    case 'checked': return 'Yes'
    case 'col1': return col1Label || 'Yes'
    case 'col2': return col2Label || 'No'
    default: return code
  }
}

// Column header for the status column, matching the on-screen table type.
function statusHeader(t: VisitPdfTable): string {
  switch (t.statusType) {
    case 'tested_not_tested': return 'Tested / Not Tested'
    case 'observation': return 'Status'
    case 'checkbox_only': return 'Done'
    case 'two_party':
    case 'two_party_exclusive': return `${t.col1Label || 'Col 1'} / ${t.col2Label || 'Col 2'}`
    default: return 'Yes / No'
  }
}

export function generateVisitPdf(params: VisitPdfParams): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: 'A4' })
    const chunks: Buffer[] = []
    doc.on('data', c => chunks.push(c))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const x0 = doc.page.margins.left
    const contentW = doc.page.width - doc.page.margins.left - doc.page.margins.right
    const pageBottom = () => doc.page.height - doc.page.margins.bottom

    const ensureSpace = (h: number) => {
      if (doc.y + h > pageBottom()) doc.addPage()
    }

    // Draws a full-width maroon bar with white title text and leaves doc.y just below it.
    // (Tracks y explicitly — .fill() does not advance doc.y, so relative-to-doc.y maths
    // after a fill lands the text in the wrong place.)
    const banner = (title: string, h: number, fs: number, align: 'left' | 'center') => {
      ensureSpace(h + 6)
      const top = doc.y
      doc.rect(x0, top, contentW, h).fill(MAROON)
      doc.fillColor('#fff').font('Helvetica-Bold').fontSize(fs)
      const ty = top + (h - fs) / 2 - 1
      if (align === 'center') doc.text(title, x0, ty, { width: contentW, align: 'center' })
      else doc.text(title, x0 + 8, ty, { width: contentW - 16 })
      doc.y = top + h
    }

    // Draws one table row (header or body). Returns the y after the row. Handles wrapping
    // + page breaks; redraws the passed header cells at the top of a fresh page when the
    // row itself is a header, so multi-page tables keep their column labels.
    const drawRow = (y: number, colWidths: number[], cells: string[], isHeader: boolean): number => {
      const pad = 4
      const fontSize = 8.5
      doc.font(isHeader ? 'Helvetica-Bold' : 'Helvetica').fontSize(fontSize)
      const totalW = colWidths.reduce((a, b) => a + b, 0)
      let h = 0
      cells.forEach((c, i) => {
        const ch = doc.heightOfString(c || '', { width: colWidths[i] - pad * 2 })
        if (ch > h) h = ch
      })
      h += pad * 2
      if (y + h > pageBottom()) { doc.addPage(); y = doc.page.margins.top }
      if (isHeader) {
        doc.rect(x0, y, totalW, h).fill(HEAD_BG)
        doc.fillColor(MAROON)
      } else {
        doc.fillColor(INK)
      }
      let cx = x0
      cells.forEach((c, i) => {
        doc.text(c || '', cx + pad, y + pad, { width: colWidths[i] - pad * 2 })
        cx += colWidths[i]
      })
      doc.strokeColor(BORDER).lineWidth(0.5)
      doc.rect(x0, y, totalW, h).stroke()
      cx = x0
      for (let i = 0; i < colWidths.length - 1; i++) {
        cx += colWidths[i]
        doc.moveTo(cx, y).lineTo(cx, y + h).stroke()
      }
      return y + h
    }

    // ---- Header band ----
    banner('EMR GLOBAL', 30, 15, 'center')
    doc.moveDown(0.5)
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(13)
    doc.text(params.formName || 'Service Report', x0, doc.y, { width: contentW, align: 'center' })
    doc.moveDown(0.8)

    // ---- Details box (key/value) ----
    const meta: [string, string][] = [
      ['Notification', params.woNumber],
      ['Job Type', params.jobType],
      ['Customer', params.customerName || '—'],
      ['Serial No(s).', params.serialNumbers || '—'],
      ['Engineer', params.engineerName],
      ['Date', new Date().toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })],
    ]
    {
      const labelW = contentW * 0.22
      const valueW = contentW * 0.78
      let y = doc.y
      for (const [label, value] of meta) {
        y = drawRow(y, [labelW, valueW], [label, value], false)
      }
      doc.y = y
    }
    doc.moveDown(1)

    // ---- Sections ----
    for (const sec of params.sections) {
      const textFields = sec.fields.filter(f => f.field_type !== 'signature' && f.field_type !== 'photo' && params.fieldValues[f.id])
      const tablesWithRows = sec.tables
        .map(t => ({ t, rows: t.rows.filter(r => params.rowValues[r.id]?.status) }))
        .filter(x => x.rows.length > 0)
      if (textFields.length === 0 && tablesWithRows.length === 0) continue

      // Section title bar
      banner(sec.title, 20, 10.5, 'left')
      doc.moveDown(0.4)

      // Text / checkbox / repeatable fields as a key/value table
      if (textFields.length > 0) {
        const labelW = contentW * 0.32
        const valueW = contentW * 0.68
        let y = doc.y
        for (const f of textFields) {
          const raw = params.fieldValues[f.id]
          let display: string
          if (f.repeatable) {
            const points = raw.split('\n').map(p => p.trim()).filter(Boolean)
            if (!points.length) continue
            display = points.map(p => `• ${p}`).join('\n')
          } else if (f.field_type === 'checkbox') {
            display = raw === 'true' ? 'Yes' : raw === 'false' ? 'No' : raw
          } else {
            display = raw
          }
          y = drawRow(y, [labelW, valueW], [f.label, display], false)
        }
        doc.y = y
        doc.moveDown(0.4)
      }

      // Tables — real bordered tables with column headers matching the form type
      for (const { t, rows } of tablesWithRows) {
        const hasSno = rows.some(r => r.sno_label)
        const hasRemarks = rows.some(r => (params.rowValues[r.id]?.remarks || '').trim())
        const cols: { header: string; frac: number; render: (r: typeof rows[number]) => string }[] = []
        if (hasSno) cols.push({ header: 'S.No', frac: 0.08, render: r => r.sno_label || '' })
        const statusFrac = 0.18
        const remarksFrac = hasRemarks ? 0.28 : 0
        const itemFrac = 1 - 0.08 * (hasSno ? 1 : 0) - statusFrac - remarksFrac
        cols.push({ header: 'Description', frac: itemFrac, render: r => r.row_label })
        cols.push({ header: statusHeader(t), frac: statusFrac, render: r => statusLabel(params.rowValues[r.id]?.status || '', t.col1Label, t.col2Label) })
        if (hasRemarks) cols.push({ header: 'Remarks', frac: remarksFrac, render: r => params.rowValues[r.id]?.remarks || '' })

        const widths = cols.map(c => c.frac * contentW)
        let y = doc.y
        y = drawRow(y, widths, cols.map(c => c.header), true)
        for (const r of rows) {
          y = drawRow(y, widths, cols.map(c => c.render(r)), false)
        }
        doc.y = y
        doc.moveDown(0.5)
      }
      doc.moveDown(0.3)
    }

    // ---- Sign-off ----
    ensureSpace(140)
    banner('Sign-off', 20, 10.5, 'left')
    doc.moveDown(1)

    const colW = contentW / 2
    const sigTop = doc.y
    const drawSignature = (x: number, title: string, name: string, sig: string | null) => {
      doc.fillColor(MUTED).font('Helvetica-Bold').fontSize(9)
      doc.text(title, x, sigTop, { width: colW - 12 })
      const buf = sig ? dataUrlToBuffer(sig) : null
      if (buf) {
        try { doc.image(buf, x, sigTop + 16, { fit: [colW - 24, 55] }) } catch { /* skip if not a valid image */ }
      }
      doc.strokeColor(BORDER).lineWidth(0.5)
      doc.moveTo(x, sigTop + 78).lineTo(x + colW - 20, sigTop + 78).stroke()
      doc.fillColor(INK).font('Helvetica').fontSize(9)
      doc.text(name || '—', x, sigTop + 82, { width: colW - 12 })
    }
    drawSignature(x0, 'Field Engineer', params.engineerName, params.engineerSignature)
    drawSignature(x0 + colW, 'Customer', params.clientName || '', params.clientSignature)

    doc.end()
  })
}
