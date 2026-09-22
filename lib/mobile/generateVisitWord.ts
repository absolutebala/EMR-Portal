import {
  Document, Packer, Paragraph, TextRun, AlignmentType, ImageRun,
  Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType, TableLayoutType,
} from 'docx'

interface VisitWordTable {
  statusType: string
  col1Label: string | null
  col2Label: string | null
  rows: { id: string; row_label: string; sno_label: string | null }[]
}
interface VisitWordSection {
  title: string
  fields: { id: string; label: string; field_type: string; repeatable?: boolean }[]
  tables: VisitWordTable[]
}

export interface VisitWordParams {
  formName?: string
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

const MAROON = '7D1D3F'
const HEAD_BG = 'F1E7EB'

function dataUrlToBuffer(dataUrl: string): Buffer | null {
  try {
    const base64 = dataUrl.split(',')[1] ?? dataUrl
    return Buffer.from(base64, 'base64')
  } catch {
    return null
  }
}

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

function statusHeader(t: VisitWordTable): string {
  switch (t.statusType) {
    case 'tested_not_tested': return 'Tested / Not Tested'
    case 'observation': return 'Status'
    case 'checkbox_only': return 'Done'
    case 'two_party':
    case 'two_party_exclusive': return `${t.col1Label || 'Col 1'} / ${t.col2Label || 'Col 2'}`
    default: return 'Yes / No'
  }
}

const CELL_BORDER = { style: BorderStyle.SINGLE, size: 4, color: 'D8CDD3' }
const CELL_BORDERS = { top: CELL_BORDER, bottom: CELL_BORDER, left: CELL_BORDER, right: CELL_BORDER }

function cell(text: string, opts: { header?: boolean; bold?: boolean; width?: number } = {}): TableCell {
  return new TableCell({
    borders: CELL_BORDERS,
    shading: opts.header ? { type: ShadingType.CLEAR, fill: HEAD_BG, color: 'auto' } : undefined,
    width: opts.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
    margins: { top: 40, bottom: 40, left: 80, right: 80 },
    children: text.split('\n').map(line =>
      new Paragraph({ children: [new TextRun({ text: line, bold: opts.header || opts.bold, size: 17, color: opts.header ? MAROON : '1C0D14' })] })
    ),
  })
}

function keyValueTable(pairs: [string, string][]): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    columnWidths: [2610, 6090],
    rows: pairs.map(([k, v]) => new TableRow({ children: [cell(k, { bold: true, width: 30 }), cell(v, { width: 70 })] })),
  })
}

function sectionBar(title: string): Paragraph {
  return new Paragraph({
    shading: { type: ShadingType.CLEAR, fill: MAROON, color: 'auto' },
    spacing: { before: 200, after: 80 },
    children: [new TextRun({ text: title, bold: true, color: 'FFFFFF', size: 21 })],
  })
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
  const children: (Paragraph | Table)[] = []

  children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 40 }, children: [new TextRun({ text: 'EMR GLOBAL', bold: true, color: MAROON, size: 30 })] }))
  children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 160 }, children: [new TextRun({ text: params.formName || 'Service Report', bold: true, size: 24, color: '1C0D14' })] }))

  children.push(keyValueTable([
    ['Notification', params.woNumber],
    ['Job Type', params.jobType],
    ['Customer', params.customerName || '—'],
    ['Serial No(s).', params.serialNumbers || '—'],
    ['Engineer', params.engineerName],
    ['Date', new Date().toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })],
  ]))
  children.push(new Paragraph({ text: '' }))

  for (const sec of params.sections) {
    const textFields = sec.fields.filter(f => f.field_type !== 'signature' && f.field_type !== 'photo' && params.fieldValues[f.id])
    const tablesWithRows = sec.tables
      .map(t => ({ t, rows: t.rows.filter(r => params.rowValues[r.id]?.status) }))
      .filter(x => x.rows.length > 0)
    if (textFields.length === 0 && tablesWithRows.length === 0) continue

    children.push(sectionBar(sec.title))

    if (textFields.length > 0) {
      const pairs: [string, string][] = []
      for (const f of textFields) {
        const raw = params.fieldValues[f.id]
        if (f.repeatable) {
          const points = raw.split('\n').map(p => p.trim()).filter(Boolean)
          if (!points.length) continue
          pairs.push([f.label, points.map(p => `• ${p}`).join('\n')])
        } else if (f.field_type === 'checkbox') {
          pairs.push([f.label, raw === 'true' ? 'Yes' : raw === 'false' ? 'No' : raw])
        } else {
          pairs.push([f.label, raw])
        }
      }
      if (pairs.length > 0) {
        children.push(keyValueTable(pairs))
        children.push(new Paragraph({ text: '' }))
      }
    }

    for (const { t, rows } of tablesWithRows) {
      const hasSno = rows.some(r => r.sno_label)
      const hasRemarks = rows.some(r => (params.rowValues[r.id]?.remarks || '').trim())
      const header: TableCell[] = []
      const cols: { render: (r: typeof rows[number]) => string; width: number }[] = []
      if (hasSno) { header.push(cell('S.No', { header: true, width: 8 })); cols.push({ render: r => r.sno_label || '', width: 8 }) }
      const statusW = 18
      const remarksW = hasRemarks ? 28 : 0
      const itemW = 100 - (hasSno ? 8 : 0) - statusW - remarksW
      header.push(cell('Description', { header: true, width: itemW })); cols.push({ render: r => r.row_label, width: itemW })
      header.push(cell(statusHeader(t), { header: true, width: statusW })); cols.push({ render: r => statusLabel(params.rowValues[r.id]?.status || '', t.col1Label, t.col2Label), width: statusW })
      if (hasRemarks) { header.push(cell('Remarks', { header: true, width: remarksW })); cols.push({ render: r => params.rowValues[r.id]?.remarks || '', width: remarksW }) }

      children.push(new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        layout: TableLayoutType.FIXED,
        columnWidths: cols.map(c => Math.round((c.width / 100) * 8700)),
        rows: [
          new TableRow({ tableHeader: true, children: header }),
          ...rows.map(r => new TableRow({ children: cols.map(c => cell(c.render(r), { width: c.width })) })),
        ],
      }))
      children.push(new Paragraph({ text: '' }))
    }
  }

  children.push(sectionBar('Sign-off'))
  children.push(new Paragraph({ spacing: { before: 120 }, children: [new TextRun({ text: 'Field Engineer: ', bold: true }), new TextRun(params.engineerName)] }))
  children.push(...signatureImage(params.engineerSignature))
  children.push(new Paragraph({ text: '' }))
  children.push(new Paragraph({ children: [new TextRun({ text: 'Customer: ', bold: true }), new TextRun(params.clientName || '—')] }))
  children.push(...signatureImage(params.clientSignature))

  const doc = new Document({ sections: [{ children }] })
  return Packer.toBuffer(doc)
}
