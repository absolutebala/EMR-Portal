import {
  Paragraph, TextRun, AlignmentType, ImageRun, Table, TableRow, TableCell,
  WidthType, BorderStyle, ShadingType, VerticalAlign,
} from 'docx'
import { COLORS, EMR_LOGO_BUFFER, dataUrlToBuffer } from './docShared'

// Word (docx) counterparts of the PdfBuilder building blocks. Each returns a
// Paragraph or Table to push into a document's children array.

type Child = Paragraph | Table
type Align = (typeof AlignmentType)[keyof typeof AlignmentType]

const B = { style: BorderStyle.SINGLE, size: 6, color: '111111' }
export const CELL_BORDERS = { top: B, bottom: B, left: B, right: B }
const NOB = { style: BorderStyle.NONE }
const NO_BORDERS = { top: NOB, bottom: NOB, left: NOB, right: NOB, insideHorizontal: NOB, insideVertical: NOB }
const MARGINS = { top: 40, bottom: 40, left: 80, right: 80 }

export function wCell(runs: TextRun[], opts: { fill?: string; cols?: number; width?: number; align?: Align } = {}): TableCell {
  return new TableCell({
    borders: CELL_BORDERS,
    columnSpan: opts.cols,
    width: opts.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
    shading: opts.fill ? { type: ShadingType.CLEAR, fill: opts.fill, color: 'auto' } : undefined,
    verticalAlign: VerticalAlign.CENTER,
    margins: MARGINS,
    children: [new Paragraph({ alignment: opts.align, children: runs })],
  })
}

export function wLV(label: string, value: string, opts: { align?: Align; fill?: string; cols?: number } = {}): TableCell {
  const runs = [new TextRun({ text: label, bold: true, size: 18 })]
  if (value) runs.push(new TextRun({ text: ` ${value}`, size: 18 }))
  return wCell(runs, opts)
}

export function wLetterhead(pillText?: string): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: NO_BORDERS,
    rows: [new TableRow({ children: [
      new TableCell({ borders: { top: NOB, bottom: NOB, left: NOB, right: NOB }, verticalAlign: VerticalAlign.CENTER, width: { size: 50, type: WidthType.PERCENTAGE }, children: [new Paragraph({ children: [new ImageRun({ data: EMR_LOGO_BUFFER, transformation: { width: 150, height: 43 }, type: 'png' })] })] }),
      new TableCell({ borders: { top: NOB, bottom: NOB, left: NOB, right: NOB }, verticalAlign: VerticalAlign.CENTER, width: { size: 50, type: WidthType.PERCENTAGE }, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: pillText ? [new TextRun({ text: `  ${pillText}  `, bold: true, color: 'FFFFFF', size: 20, shading: { type: ShadingType.CLEAR, fill: COLORS.red.replace('#', ''), color: 'auto' } })] : [] })] }),
    ] })],
  })
}

export function wTitle(text: string): Paragraph {
  return new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 120, after: 60 }, children: [new TextRun({ text, bold: true, size: 28, color: COLORS.ink.replace('#', '') })] })
}
export function wSubtitle(text: string): Paragraph {
  return new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 120 }, children: [new TextRun({ text, size: 16, color: '777777' })] })
}

export function wSectionBar(title: string, fill = 'E8E8ED', color = '1C0D14'): Paragraph {
  return new Paragraph({ shading: { type: ShadingType.CLEAR, fill, color: 'auto' }, spacing: { before: 160, after: 60 }, children: [new TextRun({ text: title, bold: true, size: 20, color: color.replace('#', '') })] })
}

export function wNumberedSection(num: string, title: string): Paragraph {
  return new Paragraph({ spacing: { before: 160, after: 40 }, border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'DDDDDD' } }, children: [new TextRun({ text: num + '  ', bold: true, size: 22, color: 'D5271F' }), new TextRun({ text: title, bold: true, size: 22, color: '1C0D14' })] })
}

export function wKvLine(label: string, value: string): Paragraph {
  return new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: label + ' ', size: 18 }), new TextRun({ text: value || '—', bold: true, size: 18 })] })
}

export function wTable(headers: string[], rows: string[][], widths?: number[]): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    columnWidths: widths,
    rows: [
      new TableRow({ tableHeader: true, children: headers.map((h, i) => wCell([new TextRun({ text: h, bold: true, size: 17, color: '1C0D14' })], { fill: 'E8E8ED', width: widths ? undefined : Math.round(100 / headers.length) })) }),
      ...rows.map(r => new TableRow({ children: r.map(c => wCell([new TextRun({ text: c || '', size: 17 })])) })),
    ],
  })
}

export function wCheckboxGroup(items: { label: string; checked: boolean }[]): Paragraph {
  const runs: TextRun[] = []
  items.forEach((it, i) => {
    runs.push(new TextRun({ text: (it.checked ? '☑ ' : '☐ ') + it.label + (i < items.length - 1 ? '     ' : ''), size: 18 }))
  })
  return new Paragraph({ spacing: { after: 60 }, children: runs })
}

export function wNumberedRows(items: string[]): Table {
  const list = items.length ? items : ['']
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: list.map((item, i) => new TableRow({ children: [wCell([new TextRun({ text: `${i + 1}. `, bold: true, size: 18 }), new TextRun({ text: item, size: 18 })])] })) })
}

export function wSignoffTwoParty(left: { title: string; headerFill: string; rows: [string, string][]; sig: string | null }, right: { title: string; headerFill: string; rows: [string, string][]; sig: string | null }): Table {
  const n = Math.max(left.rows.length, right.rows.length)
  const sigCell = (sig: string | null) => {
    const buf = dataUrlToBuffer(sig)
    const kids: Paragraph[] = [new Paragraph({ children: [new TextRun({ text: 'Signature', bold: true, size: 15, color: '777777' })] })]
    if (buf) { try { kids.push(new Paragraph({ children: [new ImageRun({ data: buf, transformation: { width: 150, height: 50 }, type: 'png' })] })) } catch { /* ignore */ } }
    return new TableCell({ borders: CELL_BORDERS, width: { size: 50, type: WidthType.PERCENTAGE }, margins: MARGINS, children: kids })
  }
  const rows: TableRow[] = [new TableRow({ children: [
    wCell([new TextRun({ text: left.title, bold: true, color: 'FFFFFF', size: 22 })], { fill: left.headerFill.replace('#', ''), align: AlignmentType.CENTER, width: 50 }),
    wCell([new TextRun({ text: right.title, bold: true, color: 'FFFFFF', size: 22 })], { fill: right.headerFill.replace('#', ''), align: AlignmentType.CENTER, width: 50 }),
  ] })]
  for (let i = 0; i < n; i++) {
    const [ll, lv] = left.rows[i] || ['', '']
    const [rl, rv] = right.rows[i] || ['', '']
    rows.push(new TableRow({ children: [wLV(ll, lv), wLV(rl, rv)] }))
  }
  rows.push(new TableRow({ children: [sigCell(left.sig), sigCell(right.sig)] }))
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows })
}

export function wSignoffStacked(blocks: { title: string; rows: [string, string][]; sig: string | null }[]): Child[] {
  const out: Child[] = []
  for (const b of blocks) {
    out.push(new Paragraph({ spacing: { before: 160, after: 40 }, children: [new TextRun({ text: b.title, bold: true, size: 20 })] }))
    const buf = dataUrlToBuffer(b.sig)
    if (buf) { try { out.push(new Paragraph({ children: [new ImageRun({ data: buf, transformation: { width: 150, height: 50 }, type: 'png' })] })) } catch { /* ignore */ } }
    for (const [l, v] of b.rows) out.push(wKvLine(l, v))
  }
  return out
}
