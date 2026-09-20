import PDFDocument from 'pdfkit'
import { COLORS, EMR_LOGO_BUFFER, LOGO_ASPECT, dataUrlToBuffer } from './docShared'

// A thin flowing-layout helper over pdfkit shared by the bespoke form generators.
// Tracks the vertical cursor, handles page breaks, and provides the handful of
// building blocks these EMR report templates need (letterheads, framed key/value
// grids, checklist tables, checkbox groups, numbered rows, and sign-off tables).
export interface Col { header: string; frac: number }

export class PdfBuilder {
  doc: PDFKit.PDFDocument
  x0: number
  W: number
  PAD = 4
  private chunks: Buffer[] = []
  private done: (b: Buffer) => void = () => {}
  private fail: (e: unknown) => void = () => {}

  constructor(opts: { margin?: number } = {}) {
    this.doc = new PDFDocument({ margin: opts.margin ?? 40, size: 'A4' })
    this.x0 = this.doc.page.margins.left
    this.W = this.doc.page.width - this.doc.page.margins.left - this.doc.page.margins.right
    this.doc.on('data', c => this.chunks.push(c))
    this.doc.on('end', () => this.done(Buffer.concat(this.chunks)))
    this.doc.on('error', e => this.fail(e))
  }

  finish(): Promise<Buffer> {
    return new Promise((resolve, reject) => { this.done = resolve; this.fail = reject; this.doc.end() })
  }

  get y() { return this.doc.y }
  set y(v: number) { this.doc.y = v }
  bottom() { return this.doc.page.height - this.doc.page.margins.bottom }
  ensure(h: number) { if (this.y + h > this.bottom()) this.doc.addPage() }
  gap(h: number) { this.y += h }

  // ── Letterheads ──
  logoLeftWithPill(pillText?: string) {
    const y = this.y
    const logoH = 30
    try { this.doc.image(EMR_LOGO_BUFFER, this.x0, y, { height: logoH }) } catch { /* ignore */ }
    if (pillText) {
      this.doc.font('Helvetica-Bold').fontSize(10)
      const tw = this.doc.widthOfString(pillText)
      const pw = tw + 24, ph = 22
      const px = this.x0 + this.W - pw, py = y + (logoH - ph) / 2
      this.doc.roundedRect(px, py, pw, ph, 11).fill(COLORS.red)
      this.doc.fillColor('#fff').text(pillText, px, py + 6, { width: pw, align: 'center' })
      this.doc.fillColor('#000')
    }
    this.y = y + logoH + 14
  }

  logoRight() {
    const y = this.y
    const logoH = 30
    const logoW = logoH * LOGO_ASPECT
    try { this.doc.image(EMR_LOGO_BUFFER, this.x0 + this.W - logoW, y, { height: logoH }) } catch { /* ignore */ }
    this.y = y + logoH + 6
  }

  rule() {
    this.doc.strokeColor(COLORS.line).lineWidth(1).moveTo(this.x0, this.y).lineTo(this.x0 + this.W, this.y).stroke()
    this.y += 8
  }

  title(text: string, size = 15) {
    this.doc.fillColor(COLORS.ink).font('Helvetica-Bold').fontSize(size)
    this.doc.text(text, this.x0, this.y, { width: this.W, align: 'center' })
    this.y += 4
  }

  subtitle(text: string) {
    this.doc.fillColor(COLORS.muted).font('Helvetica').fontSize(8)
    this.doc.text(text, this.x0, this.y, { width: this.W, align: 'center' })
    this.y += 6
    this.doc.fillColor('#000')
  }

  // Full-width shaded section bar with a title.
  sectionBar(title: string, opts: { fill?: string; color?: string } = {}) {
    const h = 20
    this.ensure(h + 4)
    const y = this.y
    this.doc.rect(this.x0, y, this.W, h).fill(opts.fill ?? COLORS.grayBg)
    this.doc.fillColor(opts.color ?? COLORS.ink).font('Helvetica-Bold').fontSize(10.5)
    this.doc.text(title, this.x0 + 8, y + 5, { width: this.W - 16 })
    this.doc.fillColor('#000')
    this.y = y + h
  }

  // "N. Title ─────" style section header (Incident Report look).
  numberedSection(num: string, title: string) {
    this.ensure(24)
    this.doc.font('Helvetica-Bold').fontSize(11)
    this.doc.fillColor(COLORS.red).text(num, this.x0, this.y, { continued: true })
    this.doc.fillColor(COLORS.ink).text('  ' + title)
    this.y += 2
    this.doc.strokeColor('#DDDDDD').lineWidth(0.8).moveTo(this.x0, this.y).lineTo(this.x0 + this.W, this.y).stroke()
    this.doc.fillColor('#000')
    this.y += 6
  }

  private cellText(x: number, y: number, w: number, h: number, label: string, value: string, opts: { fill?: string; align?: 'left' | 'center'; header?: boolean } = {}) {
    if (opts.fill) this.doc.rect(x, y, w, h).fill(opts.fill)
    this.doc.strokeColor(COLORS.line).lineWidth(0.7).rect(x, y, w, h).stroke()
    this.doc.fillColor(opts.header ? COLORS.ink : '#000').fontSize(9)
    const ty = y + this.PAD
    if (opts.align === 'center') {
      this.doc.font('Helvetica-Bold').text(label + (value ? ` ${value}` : ''), x + this.PAD, ty, { width: w - this.PAD * 2, align: 'center' })
    } else {
      this.doc.font('Helvetica-Bold').text(label, x + this.PAD, ty, { width: w - this.PAD * 2, continued: !!value })
      if (value) this.doc.font('Helvetica').text(` ${value}`)
    }
  }

  private measure(label: string, value: string, w: number): number {
    this.doc.font('Helvetica-Bold').fontSize(9)
    return this.doc.heightOfString(label + (value ? ` ${value}` : ''), { width: w - this.PAD * 2 }) + this.PAD * 2
  }

  // One row of a framed key/value grid. cells give fractional widths.
  gridRow(cells: { frac: number; label: string; value?: string; align?: 'center'; fill?: string }[], minH = 24) {
    const widths = cells.map(c => c.frac * this.W)
    const h = Math.max(minH, ...cells.map((c, i) => this.measure(c.label, c.value || '', widths[i])))
    if (this.y + h > this.bottom()) this.doc.addPage()
    // Capture the row's top once — cellText() calls doc.text() which mutates this.y,
    // so reading this.y per cell would stagger the columns diagonally.
    const y = this.y
    let cx = this.x0
    cells.forEach((c, i) => { this.cellText(cx, y, widths[i], h, c.label, c.value || '', { align: c.align, fill: c.fill }); cx += widths[i] })
    this.y = y + h
  }

  // Simple label:value lines (no borders), colon-aligned-ish.
  kvLine(label: string, value: string, opts: { labelW?: number } = {}) {
    this.ensure(16)
    this.doc.fontSize(9.5).fillColor('#000')
    this.doc.font('Helvetica').text(label, this.x0, this.y, { continued: true })
    this.doc.font('Helvetica-Bold').text(value ? ` ${value}` : ' —')
    this.y += 4
    void opts
  }

  // A checklist / data table with a header row and wrapped body rows + borders.
  table(cols: Col[], rows: string[][], opts: { headerFill?: string; headerColor?: string; fontSize?: number } = {}) {
    const widths = cols.map(c => c.frac * this.W)
    const fs = opts.fontSize ?? 8.5
    const drawRow = (cells: string[], header: boolean) => {
      this.doc.font(header ? 'Helvetica-Bold' : 'Helvetica').fontSize(fs)
      let h = 0
      cells.forEach((c, i) => { const ch = this.doc.heightOfString(c || '', { width: widths[i] - this.PAD * 2 }); if (ch > h) h = ch })
      h += this.PAD * 2
      if (this.y + h > this.bottom()) { this.doc.addPage() }
      const y = this.y
      const total = widths.reduce((a, b) => a + b, 0)
      if (header) { this.doc.rect(this.x0, y, total, h).fill(opts.headerFill ?? COLORS.grayBg); this.doc.fillColor(opts.headerColor ?? COLORS.ink) }
      else this.doc.fillColor('#000')
      let cx = this.x0
      cells.forEach((c, i) => { this.doc.font(header ? 'Helvetica-Bold' : 'Helvetica').text(c || '', cx + this.PAD, y + this.PAD, { width: widths[i] - this.PAD * 2 }); cx += widths[i] })
      this.doc.strokeColor(COLORS.line).lineWidth(0.6).rect(this.x0, y, total, h).stroke()
      cx = this.x0
      for (let i = 0; i < widths.length - 1; i++) { cx += widths[i]; this.doc.moveTo(cx, y).lineTo(cx, y + h).stroke() }
      this.y = y + h
    }
    drawRow(cols.map(c => c.header), true)
    for (const r of rows) drawRow(r, false)
  }

  // Numbered bordered rows (service-detail lists).
  numberedRows(items: string[]) {
    const list = items.length ? items : ['']
    list.forEach((item, i) => this.gridRow([{ frac: 1, label: `${i + 1}.`, value: item }], 22))
  }

  // Inline checkbox group: small squares (filled if checked) + labels, wrapping.
  checkboxGroup(items: { label: string; checked: boolean }[]) {
    const box = 9, gap = 5, itemGap = 14, lh = 18
    this.doc.font('Helvetica').fontSize(9)
    let cx = this.x0
    this.ensure(lh)
    let y = this.y
    for (const it of items) {
      const tw = this.doc.widthOfString(it.label)
      const iw = box + gap + tw + itemGap
      if (cx + iw > this.x0 + this.W) { y += lh; cx = this.x0; if (y + lh > this.bottom()) { this.doc.addPage(); y = this.doc.y } }
      this.doc.strokeColor(COLORS.line).lineWidth(0.8).rect(cx, y + 1, box, box).stroke()
      if (it.checked) {
        this.doc.save().lineWidth(1.2).strokeColor(COLORS.red)
        this.doc.moveTo(cx + 1.5, y + 5).lineTo(cx + 3.5, y + 7.5).lineTo(cx + 7.5, y + 2).stroke().restore()
      }
      this.doc.fillColor('#000').text(it.label, cx + box + gap, y + 1, { lineBreak: false })
      cx += iw
    }
    this.y = y + lh
  }

  // Two-party sign-off table with coloured header cells and signature areas.
  signoffTwoParty(left: { title: string; headerFill: string; rows: [string, string][]; sig: string | null }, right: { title: string; headerFill: string; rows: [string, string][]; sig: string | null }) {
    const half = this.W / 2
    const hRow = 22, rowH = 20, sigH = 58
    const rows = Math.max(left.rows.length, right.rows.length)
    const totalH = hRow + rows * rowH + sigH
    this.ensure(totalH + 6)
    let y = this.y
    // header
    this.doc.rect(this.x0, y, half, hRow).fill(left.headerFill)
    this.doc.rect(this.x0 + half, y, half, hRow).fill(right.headerFill)
    this.doc.strokeColor(COLORS.line).lineWidth(0.7).rect(this.x0, y, half, hRow).stroke()
    this.doc.strokeColor(COLORS.line).lineWidth(0.7).rect(this.x0 + half, y, half, hRow).stroke()
    this.doc.fillColor('#fff').font('Helvetica-Bold').fontSize(10.5)
    this.doc.text(left.title, this.x0, y + 5, { width: half, align: 'center' })
    this.doc.text(right.title, this.x0 + half, y + 5, { width: half, align: 'center' })
    y += hRow
    const drawSide = (px: number, side: { rows: [string, string][]; sig: string | null }) => {
      let ry = y
      for (let i = 0; i < rows; i++) {
        const [lbl, val] = side.rows[i] || ['', '']
        this.cellText(px, ry, half, rowH, lbl, val)
        ry += rowH
      }
      this.doc.strokeColor(COLORS.line).lineWidth(0.7).rect(px, ry, half, sigH).stroke()
      const buf = dataUrlToBuffer(side.sig)
      if (buf) { try { this.doc.image(buf, px + this.PAD, ry + this.PAD, { fit: [half - this.PAD * 2, sigH - this.PAD * 2] }) } catch { /* ignore */ } }
    }
    drawSide(this.x0, left)
    drawSide(this.x0 + half, right)
    this.y = y + rows * rowH + sigH
  }

  // Stacked sign-off block (Customer Representative / Easun-MR style, no table).
  signoffStacked(blocks: { title: string; rows: [string, string][]; sig: string | null }[]) {
    for (const b of blocks) {
      this.ensure(90)
      this.doc.font('Helvetica-Bold').fontSize(10).fillColor(COLORS.ink).text(b.title, this.x0, this.y)
      this.y += 6
      const buf = dataUrlToBuffer(b.sig)
      if (buf) { try { this.doc.image(buf, this.x0, this.y, { fit: [150, 45] }) } catch { /* ignore */ } }
      this.y += 48
      for (const [lbl, val] of b.rows) { this.kvLine(lbl, val) }
      this.y += 10
    }
  }

  footerAddresses(cols: { heading: string; lines: string[] }[], website?: string) {
    // Pin to the bottom of the current page.
    const startY = this.bottom() - 70
    if (this.y < startY) this.y = startY
    const colW = this.W / cols.length
    const top = this.y
    cols.forEach((c, i) => {
      const cx = this.x0 + i * colW
      this.doc.font('Helvetica-Bold').fontSize(10).fillColor(COLORS.red).text(c.heading, cx, top)
      this.doc.font('Helvetica').fontSize(8.5).fillColor('#333')
      let ly = top + 14
      for (const ln of c.lines) { this.doc.text(ln, cx, ly, { width: colW - 8 }); ly += 11 }
    })
    if (website) { this.doc.fillColor(COLORS.blue).fontSize(8.5).text(website, this.x0, top + 58, { width: this.W, align: 'center' }) }
    this.doc.fillColor('#000')
  }
}
