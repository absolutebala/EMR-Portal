import PDFDocument from 'pdfkit'
import {
  Document, Packer, Paragraph, TextRun, AlignmentType, ImageRun,
  Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType, VerticalAlign, TableLayoutType,
} from 'docx'
import { EMR_LOGO_BUFFER } from './emrLogo'
import type { VisitPdfParams } from './generateVisitPdf'

// Dedicated renderer for the "OLTC Service MOM" report — reproduces the bespoke
// paper template (EMR Tap Changers letterhead, framed detail grid, OLTC / Transformer
// two-column block, numbered service-detail rows, and the blue CUSTOMER / red EMR
// sign-off table) filled with the engineer's submitted data. Other forms fall back to
// the generic structured renderer in generateVisitPdf/Word.

const RED = '#D5271F'
const BLUE = '#2F6FE0'
const GRAY_BG = '#E8E8ED'
const LINE = '#111111'

function dataUrlToBuffer(dataUrl: string): Buffer | null {
  try {
    const base64 = dataUrl.split(',')[1] ?? dataUrl
    return Buffer.from(base64, 'base64')
  } catch { return null }
}

function fmtVal(v: string | undefined | null): string {
  if (!v) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const d = new Date(v + 'T00:00:00')
    if (!isNaN(d.getTime())) return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  }
  return v
}

// Flattens all field values into a label→value map (labels are unique within this form).
function buildByLabel(params: VisitPdfParams): Record<string, string> {
  const m: Record<string, string> = {}
  for (const sec of params.sections) {
    for (const f of sec.fields) {
      const v = params.fieldValues[f.id]
      if (v != null && v !== '') m[f.label] = v
    }
  }
  return m
}

function pickChecked(by: Record<string, string>, labels: string[]): string {
  const on = labels.filter(l => by[l] === 'true')
  return on.join(', ')
}

// The "OLTC - Service Details" body comes from one of two shapes: the OLTC Service MOM
// stores it as a free-text field ("Service Details", newline-separated points); the
// Overhauling MOM stores it as a table of predefined numbered rows. Either way we
// return an ordered list of lines to render as numbered rows.
function serviceDetailItems(params: VisitPdfParams, by: Record<string, string>): string[] {
  const free = by['Service Details']
  if (free && free.trim()) return free.split('\n').map(s => s.trim()).filter(Boolean)
  const sec = params.sections.find(s => /service details/i.test(s.title))
  const lines: string[] = []
  const intro = by['OLTC Sl. No.']
  if (intro) lines.push(`EMR Engineer visited the site regarding inspection and rectification of OLTC Sl. No. ${intro}.`)
  if (sec) for (const t of sec.tables) for (const r of t.rows) lines.push(r.row_label)
  return lines
}

// Lines for the OLTC-Details / Transformer-Details boxes: every text field as
// "Label: value" and every ticked checkbox as "✓ Label", so no submitted data is lost
// even though the original template only printed a subset.
function sectionLines(params: VisitPdfParams, sectionTitle: string): { label: string; value: string; check?: boolean }[] {
  const sec = params.sections.find(s => s.title === sectionTitle)
  if (!sec) return []
  const out: { label: string; value: string; check?: boolean }[] = []
  for (const f of sec.fields) {
    const raw = params.fieldValues[f.id]
    if (raw == null || raw === '') continue
    if (f.field_type === 'checkbox') {
      if (raw === 'true') out.push({ label: f.label, value: '', check: true })
    } else {
      out.push({ label: f.label, value: fmtVal(raw) })
    }
  }
  return out
}

// ───────────────────────────── PDF ─────────────────────────────

export function generateOltcMomPdf(params: VisitPdfParams): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: 'A4' })
    const chunks: Buffer[] = []
    doc.on('data', c => chunks.push(c))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const by = buildByLabel(params)
    const x0 = doc.page.margins.left
    const W = doc.page.width - doc.page.margins.left - doc.page.margins.right
    const bottom = () => doc.page.height - doc.page.margins.bottom
    const PAD = 5

    // Draws a bordered cell with a bold label followed by a normal-weight value.
    const cell = (x: number, y: number, w: number, h: number, label: string, value: string, opts: { fill?: string; align?: 'left' | 'center'; bold?: boolean } = {}) => {
      if (opts.fill) doc.rect(x, y, w, h).fill(opts.fill)
      doc.strokeColor(LINE).lineWidth(0.8).rect(x, y, w, h).stroke()
      doc.fillColor('#000').fontSize(9)
      const ty = y + PAD
      if (opts.align === 'center') {
        doc.font('Helvetica-Bold').text(label + (value ? ` ${value}` : ''), x + PAD, ty, { width: w - PAD * 2, align: 'center' })
      } else {
        doc.font('Helvetica-Bold').text(label, x + PAD, ty, { width: w - PAD * 2, continued: !!value })
        if (value) doc.font('Helvetica').text(` ${value}`)
      }
    }

    const measure = (label: string, value: string, w: number): number => {
      doc.font('Helvetica-Bold').fontSize(9)
      const h = doc.heightOfString(label + (value ? ` ${value}` : ''), { width: w - PAD * 2 })
      return h + PAD * 2
    }

    // ── Letterhead ──
    let y = doc.y
    const logoH = 48
    const logoW = logoH * (1409 / 407)
    try { doc.image(EMR_LOGO_BUFFER, x0, y, { height: logoH }) } catch { /* ignore */ }
    // Red pill, right-aligned
    const pillText = 'EMR Tap Changers Private Limited'
    doc.font('Helvetica-Bold').fontSize(10)
    const pillTextW = doc.widthOfString(pillText)
    const pillW = pillTextW + 24
    const pillH = 22
    const pillX = x0 + W - pillW
    const pillY = y + (logoH - pillH) / 2
    doc.roundedRect(pillX, pillY, pillW, pillH, 11).fill(RED)
    doc.fillColor('#fff').text(pillText, pillX, pillY + 6, { width: pillW, align: 'center' })
    doc.fillColor('#000')
    y += logoH + 16
    void logoW

    // ── Detail grid ──
    const c40 = W * 0.40, c35 = W * 0.35, c25 = W * 0.25
    const c72 = W * 0.72, c28 = W * 0.28

    const rowFixed = (cells: { w: number; label: string; value: string; align?: 'center' }[]) => {
      const h = Math.max(26, ...cells.map(c => measure(c.label, c.value, c.w)))
      if (y + h > bottom()) { doc.addPage(); y = doc.page.margins.top }
      let cx = x0
      for (const c of cells) { cell(cx, y, c.w, h, c.label, c.value, { align: c.align }); cx += c.w }
      y += h
    }

    rowFixed([{ w: c72, label: 'Customer:', value: fmtVal(by['Customer']) }, { w: c28, label: 'Date:', value: fmtVal(by['Date']) }])
    rowFixed([{ w: W, label: 'Site Address:', value: fmtVal(by['Site Address']) }])
    rowFixed([
      { w: c40, label: 'Site Reporting Date:', value: fmtVal(by['Site Reporting Date']) },
      { w: c35, label: 'Completion Date:', value: fmtVal(by['Completion Date']) },
      { w: c25, label: 'No. of days:', value: fmtVal(by['No. of days']) },
    ])
    rowFixed([
      { w: c40, label: 'Last Service Date:', value: fmtVal(by['Last Service Date']) },
      { w: c35, label: 'Next Due In Operation:', value: fmtVal(by['Next Due In Operation']) },
      { w: c25, label: 'Next Due Date:', value: fmtVal(by['Next Due Date']) },
    ])
    rowFixed([
      { w: c40, label: 'Warranty:', value: pickChecked(by, ['Warranty', 'Non-Warranty']) },
      { w: c35, label: 'Recoverable:', value: pickChecked(by, ['Recoverable', 'Non-Recoverable']), align: 'center' },
      { w: c25, label: 'Business Opportunity:', value: by['Business Opportunity'] === 'true' ? 'Yes' : '' },
    ])

    y += 8

    // ── OLTC Details | Transformer Details ──
    const half = W / 2
    const oltcLines = sectionLines(params, 'OLTC Details')
    const txLines = sectionLines(params, 'Transformer Details')
    // header row
    const hH = 22
    if (y + hH > bottom()) { doc.addPage(); y = doc.page.margins.top }
    cell(x0, y, half, hH, 'OLTC Details:', '', { fill: GRAY_BG })
    cell(x0 + half, y, half, hH, 'Transformer Details:', '', { fill: GRAY_BG })
    y += hH
    // body: measure each side
    const lineH = 15
    const bodyH = Math.max(oltcLines.length, txLines.length, 3) * lineH + PAD * 2
    if (y + bodyH > bottom()) { doc.addPage(); y = doc.page.margins.top }
    doc.strokeColor(LINE).lineWidth(0.8).rect(x0, y, half, bodyH).stroke()
    doc.strokeColor(LINE).lineWidth(0.8).rect(x0 + half, y, half, bodyH).stroke()
    const drawLines = (lx: number, lines: { label: string; value: string; check?: boolean }[]) => {
      let ly = y + PAD
      doc.fontSize(9)
      for (const ln of lines) {
        if (ln.check) {
          // Helvetica (pdfkit's built-in) has no ✓ glyph — a filled bullet marks the
          // ticked option instead and renders reliably.
          doc.font('Helvetica-Bold').fillColor('#000').text(`• ${ln.label}`, lx + PAD, ly, { width: half - PAD * 2 })
        } else {
          doc.font('Helvetica-Bold').fillColor('#000').text(ln.label + ':', lx + PAD, ly, { width: half - PAD * 2, continued: !!ln.value })
          if (ln.value) doc.font('Helvetica').text(` ${ln.value}`)
        }
        ly += lineH
      }
    }
    drawLines(x0, oltcLines)
    drawLines(x0 + half, txLines)
    y += bodyH + 8

    // ── Full-width sections (Service Details / Comments / Recommended Spares) ──
    const grayHeader = (title: string) => {
      const h = 22
      if (y + h > bottom()) { doc.addPage(); y = doc.page.margins.top }
      cell(x0, y, W, h, title, '', { fill: GRAY_BG })
      y += h
    }
    // Numbered ruled rows (Service Details) — one bordered row per non-empty line.
    const numberedRows = (value: string) => {
      const items = (value || '').split('\n').map(s => s.trim()).filter(Boolean)
      const list = items.length ? items : ['']
      list.forEach((item, i) => {
        const h = Math.max(24, measure(`${i + 1}.`, item, W))
        if (y + h > bottom()) { doc.addPage(); y = doc.page.margins.top }
        cell(x0, y, W, h, `${i + 1}.`, item)
        y += h
      })
    }
    const textBlock = (value: string) => {
      const h = Math.max(28, measure('', value, W))
      if (y + h > bottom()) { doc.addPage(); y = doc.page.margins.top }
      cell(x0, y, W, h, '', value)
      y += h
    }

    grayHeader('OLTC - Service Details:')
    numberedRows(serviceDetailItems(params, by).join('\n'))
    y += 6
    if (by['Comments']) {
      grayHeader('Customer Comments, Appreciation & Feedback:')
      textBlock(by['Comments'])
      y += 6
    }
    grayHeader('Recommended Spares:')
    textBlock(by['Recommended Spares'] || '')
    y += 12

    // ── Sign-off table (CUSTOMER | EMR) ──
    const signOffH = 150
    if (y + signOffH > bottom()) { doc.addPage(); y = doc.page.margins.top }
    const hRow = 24
    // colored headers
    doc.rect(x0, y, half, hRow).fill(BLUE)
    doc.rect(x0 + half, y, half, hRow).fill(RED)
    doc.strokeColor(LINE).lineWidth(0.8).rect(x0, y, half, hRow).stroke()
    doc.strokeColor(LINE).lineWidth(0.8).rect(x0 + half, y, half, hRow).stroke()
    doc.fillColor('#fff').font('Helvetica-Bold').fontSize(11)
    doc.text('CUSTOMER', x0, y + 6, { width: half, align: 'center' })
    doc.text('EMR', x0 + half, y + 6, { width: half, align: 'center' })
    y += hRow

    const partyRows = 3
    const partyRowH = 22
    const drawParty = (px: number, name: string, phone: string, email: string, sig: string | null) => {
      const rows: [string, string][] = [['Name:', name], ['Ph No:', phone], ['Email:', email]]
      let ry = y
      for (const [lbl, val] of rows) {
        cell(px, ry, half, partyRowH, lbl, fmtVal(val))
        ry += partyRowH
      }
      // signature area
      const sigH = signOffH - hRow - partyRows * partyRowH
      doc.strokeColor(LINE).lineWidth(0.8).rect(px, ry, half, sigH).stroke()
      const buf = sig ? dataUrlToBuffer(sig) : null
      if (buf) { try { doc.image(buf, px + PAD, ry + PAD, { fit: [half - PAD * 2, sigH - PAD * 2] }) } catch { /* ignore */ } }
    }
    drawParty(x0, by['Customer Name'] || params.clientName || '', by['Customer Phone No.'] || '', by['Customer Email'] || '', params.clientSignature)
    drawParty(x0 + half, by['Field Engineer Name'] || params.engineerName || '', by['Field Engineer Phone No.'] || '', by['Field Engineer Email'] || '', params.engineerSignature)

    doc.end()
  })
}

// ───────────────────────────── Word ─────────────────────────────

const B = { style: BorderStyle.SINGLE, size: 6, color: '111111' }
const BORDERS = { top: B, bottom: B, left: B, right: B }

type Align = (typeof AlignmentType)[keyof typeof AlignmentType]
function wcell(runs: TextRun[], opts: { fill?: string; cols?: number; width?: number; align?: Align } = {}): TableCell {
  return new TableCell({
    borders: BORDERS,
    columnSpan: opts.cols,
    width: opts.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
    shading: opts.fill ? { type: ShadingType.CLEAR, fill: opts.fill, color: 'auto' } : undefined,
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 40, bottom: 40, left: 80, right: 80 },
    children: [new Paragraph({ alignment: opts.align, children: runs })],
  })
}

function lv(label: string, value: string, align?: Align, fill?: string): TableCell {
  const runs = [new TextRun({ text: label, bold: true, size: 18 })]
  if (value) runs.push(new TextRun({ text: ` ${value}`, size: 18 }))
  return wcell(runs, { align, fill })
}

export async function generateOltcMomWord(params: VisitPdfParams): Promise<Buffer> {
  const by = buildByLabel(params)
  const children: (Paragraph | Table)[] = []

  // Letterhead: logo + red pill, side by side via a borderless 2-col table
  const NOB = { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } }
  children.push(new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    // Fixed column grid so Word doesn't autofit the text cell down to ~1 char wide
    // (which made the company name wrap vertically, one letter per line).
    layout: TableLayoutType.FIXED,
    columnWidths: [4350, 4350],
    borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE }, insideHorizontal: { style: BorderStyle.NONE }, insideVertical: { style: BorderStyle.NONE } },
    rows: [new TableRow({ children: [
      new TableCell({ borders: NOB, verticalAlign: VerticalAlign.CENTER, width: { size: 4350, type: WidthType.DXA }, children: [new Paragraph({ children: [new ImageRun({ data: EMR_LOGO_BUFFER, transformation: { width: 230, height: 66 }, type: 'png' })] })] }),
      new TableCell({ borders: NOB, verticalAlign: VerticalAlign.CENTER, width: { size: 4350, type: WidthType.DXA }, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: '  EMR Tap Changers Private Limited  ', bold: true, color: 'FFFFFF', size: 20, shading: { type: ShadingType.CLEAR, fill: 'D5271F', color: 'auto' } })] })] }),
    ] })],
  }))
  children.push(new Paragraph({ text: '' }))

  // Detail grid
  children.push(new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    columnWidths: [2900, 1450, 1450, 1450, 1450],
    rows: [
      new TableRow({ children: [lv('Customer:', fmtVal(by['Customer']), undefined), lv('Date:', fmtVal(by['Date']), undefined)].map((c, i) => i === 0 ? new TableCell({ ...({} as object), borders: BORDERS, columnSpan: 4, verticalAlign: VerticalAlign.CENTER, margins: { top: 40, bottom: 40, left: 80, right: 80 }, children: [new Paragraph({ children: [new TextRun({ text: 'Customer:', bold: true, size: 18 }), new TextRun({ text: ` ${fmtVal(by['Customer'])}`, size: 18 })] })] }) : c) }),
      new TableRow({ children: [wcell([new TextRun({ text: 'Site Address:', bold: true, size: 18 }), new TextRun({ text: ` ${fmtVal(by['Site Address'])}`, size: 18 })], { cols: 5 })] }),
      new TableRow({ children: [
        new TableCell({ borders: BORDERS, columnSpan: 2, margins: { top: 40, bottom: 40, left: 80, right: 80 }, children: [new Paragraph({ children: [new TextRun({ text: 'Site Reporting Date:', bold: true, size: 18 }), new TextRun({ text: ` ${fmtVal(by['Site Reporting Date'])}`, size: 18 })] })] }),
        new TableCell({ borders: BORDERS, columnSpan: 2, margins: { top: 40, bottom: 40, left: 80, right: 80 }, children: [new Paragraph({ children: [new TextRun({ text: 'Completion Date:', bold: true, size: 18 }), new TextRun({ text: ` ${fmtVal(by['Completion Date'])}`, size: 18 })] })] }),
        lv('No. of days:', fmtVal(by['No. of days'])),
      ] }),
      new TableRow({ children: [
        new TableCell({ borders: BORDERS, columnSpan: 2, margins: { top: 40, bottom: 40, left: 80, right: 80 }, children: [new Paragraph({ children: [new TextRun({ text: 'Last Service Date:', bold: true, size: 18 }), new TextRun({ text: ` ${fmtVal(by['Last Service Date'])}`, size: 18 })] })] }),
        new TableCell({ borders: BORDERS, columnSpan: 2, margins: { top: 40, bottom: 40, left: 80, right: 80 }, children: [new Paragraph({ children: [new TextRun({ text: 'Next Due In Operation:', bold: true, size: 18 }), new TextRun({ text: ` ${fmtVal(by['Next Due In Operation'])}`, size: 18 })] })] }),
        lv('Next Due Date:', fmtVal(by['Next Due Date'])),
      ] }),
      new TableRow({ children: [
        new TableCell({ borders: BORDERS, columnSpan: 2, margins: { top: 40, bottom: 40, left: 80, right: 80 }, children: [new Paragraph({ children: [new TextRun({ text: 'Warranty:', bold: true, size: 18 }), new TextRun({ text: ` ${pickChecked(by, ['Warranty', 'Non-Warranty'])}`, size: 18 })] })] }),
        new TableCell({ borders: BORDERS, columnSpan: 2, verticalAlign: VerticalAlign.CENTER, margins: { top: 40, bottom: 40, left: 80, right: 80 }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Recoverable:', bold: true, size: 18 }), new TextRun({ text: ` ${pickChecked(by, ['Recoverable', 'Non-Recoverable'])}`, size: 18 })] })] }),
        lv('Business Opportunity:', by['Business Opportunity'] === 'true' ? 'Yes' : ''),
      ] }),
    ],
  }))
  children.push(new Paragraph({ text: '' }))

  // OLTC | Transformer two-column block
  const oltcLines = sectionLines(params, 'OLTC Details')
  const txLines = sectionLines(params, 'Transformer Details')
  const linePara = (ln: { label: string; value: string; check?: boolean }) =>
    ln.check
      ? new Paragraph({ children: [new TextRun({ text: `✓ ${ln.label}`, bold: true, size: 18 })] })
      : new Paragraph({ children: [new TextRun({ text: `${ln.label}:`, bold: true, size: 18 }), new TextRun({ text: ` ${ln.value}`, size: 18 })] })
  children.push(new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ children: [wcell([new TextRun({ text: 'OLTC Details:', bold: true, size: 18 })], { fill: 'E8E8ED', width: 50 }), wcell([new TextRun({ text: 'Transformer Details:', bold: true, size: 18 })], { fill: 'E8E8ED', width: 50 })] }),
      new TableRow({ children: [
        new TableCell({ borders: BORDERS, width: { size: 50, type: WidthType.PERCENTAGE }, margins: { top: 60, bottom: 60, left: 80, right: 80 }, children: oltcLines.length ? oltcLines.map(linePara) : [new Paragraph({ text: '' })] }),
        new TableCell({ borders: BORDERS, width: { size: 50, type: WidthType.PERCENTAGE }, margins: { top: 60, bottom: 60, left: 80, right: 80 }, children: txLines.length ? txLines.map(linePara) : [new Paragraph({ text: '' })] }),
      ] }),
    ],
  }))
  children.push(new Paragraph({ text: '' }))

  // Full-width gray-header sections
  const grayHeaderTable = (title: string) => new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [new TableRow({ children: [wcell([new TextRun({ text: title, bold: true, size: 18 })], { fill: 'E8E8ED' })] })] })
  const numberedTable = (value: string) => {
    const items = (value || '').split('\n').map(s => s.trim()).filter(Boolean)
    const list = items.length ? items : ['']
    return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: list.map((item, i) => new TableRow({ children: [wcell([new TextRun({ text: `${i + 1}. `, bold: true, size: 18 }), new TextRun({ text: item, size: 18 })])] })) })
  }
  const textTable = (value: string) => new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [new TableRow({ children: [wcell([new TextRun({ text: value || '', size: 18 })])] })] })

  children.push(grayHeaderTable('OLTC - Service Details:'))
  children.push(numberedTable(serviceDetailItems(params, by).join('\n')))
  children.push(new Paragraph({ text: '' }))
  if (by['Comments']) {
    children.push(grayHeaderTable('Customer Comments, Appreciation & Feedback:'))
    children.push(textTable(by['Comments']))
    children.push(new Paragraph({ text: '' }))
  }
  children.push(grayHeaderTable('Recommended Spares:'))
  children.push(textTable(by['Recommended Spares'] || ''))
  children.push(new Paragraph({ text: '' }))

  // Sign-off table
  const sigCell = (sig: string | null) => {
    const buf = sig ? dataUrlToBuffer(sig) : null
    const kids: Paragraph[] = [new Paragraph({ children: [new TextRun({ text: 'Signature', bold: true, size: 16, color: '777777' })] })]
    if (buf) { try { kids.push(new Paragraph({ children: [new ImageRun({ data: buf, transformation: { width: 150, height: 55 }, type: 'png' })] })) } catch { /* ignore */ } }
    return new TableCell({ borders: BORDERS, width: { size: 50, type: WidthType.PERCENTAGE }, margins: { top: 60, bottom: 60, left: 80, right: 80 }, children: kids })
  }
  children.push(new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ children: [wcell([new TextRun({ text: 'CUSTOMER', bold: true, color: 'FFFFFF', size: 22 })], { fill: '2F6FE0', align: AlignmentType.CENTER, width: 50 }), wcell([new TextRun({ text: 'EMR', bold: true, color: 'FFFFFF', size: 22 })], { fill: 'D5271F', align: AlignmentType.CENTER, width: 50 })] }),
      new TableRow({ children: [lv('Name:', fmtVal(by['Customer Name'] || params.clientName || '')), lv('Name:', fmtVal(by['Field Engineer Name'] || params.engineerName || ''))] }),
      new TableRow({ children: [lv('Ph No:', fmtVal(by['Customer Phone No.'] || '')), lv('Ph No:', fmtVal(by['Field Engineer Phone No.'] || ''))] }),
      new TableRow({ children: [lv('Email:', fmtVal(by['Customer Email'] || '')), lv('Email:', fmtVal(by['Field Engineer Email'] || ''))] }),
      new TableRow({ children: [sigCell(params.clientSignature), sigCell(params.engineerSignature)] }),
    ],
  }))

  const doc = new Document({ sections: [{ children }] })
  return Packer.toBuffer(doc)
}
