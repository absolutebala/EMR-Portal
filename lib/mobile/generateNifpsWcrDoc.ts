import {
  Document, Packer, Paragraph, TextRun, AlignmentType,
  Table, TableRow, TableCell, WidthType, ShadingType, VerticalAlign, TableLayoutType,
} from 'docx'
import { PdfBuilder } from './docPdfKit'
import {
  wLetterhead, wSectionBar, wNumberedRows, wSignoffTwoParty, CELL_BORDERS,
} from './docDocxKit'
import { COLORS, buildByLabel, fmtVal } from './docShared'
import type { VisitPdfParams } from './generateVisitPdf'

// Dedicated renderer for the "NIFPS Work Completion Report" form — reproduces the
// bespoke paper template (EMR logo top-right, one big framed detail grid, numbered
// service-details narrative, blue CUSTOMER / red Easun-MR sign-off, and plant-address
// footer) filled with the engineer's submitted data.

const SERVICE_SECTION = 'NIFPS System Installation and Commissioning / Service details'

// Comma-joins the labels whose checkbox was ticked, stripping a shared prefix.
function checkedLocations(by: Record<string, string>): string {
  const labels = [
    'Location: Power Station',
    'Location: Furnace',
    'Location: Power Transformer',
    'Location: Auto transformer',
    'Location: Inverter Transformer',
  ]
  return labels.filter(l => by[l] === 'true').map(l => l.replace('Location: ', '')).join(', ')
}

function variant(by: Record<string, string>): string {
  return [
    by['Single Cylinder'] === 'true' ? 'Single Cylinder' : '',
    by['Double Cylinder'] === 'true' ? 'Double Cylinder' : '',
  ].filter(Boolean).join(', ')
}

// Rows of the single service-details table, as full-sentence narrative lines.
function serviceRows(params: VisitPdfParams): string[] {
  const sec = params.sections.find(s => s.title === SERVICE_SECTION)
  const table = sec?.tables[0]
  if (!table) return []
  return table.rows.map(r => r.row_label)
}

// ───────────────────────────── PDF ─────────────────────────────

export function generateNifpsWcrPdf(params: VisitPdfParams): Promise<Buffer> {
  const b = new PdfBuilder({ margin: 40 })
  const by = buildByLabel(params)

  b.logoRight()

  // ── Framed detail grid ──
  b.gridRow([{ frac: 1, label: 'WORK COMPLETION REPORT', align: 'center' }])
  b.gridRow([
    { frac: 0.7, label: 'Customer Name:', value: by['Customer Name'] },
    { frac: 0.3, label: 'Date:', value: fmtVal(by['Date']) },
  ])
  b.gridRow([{ frac: 1, label: 'Site Address:', value: by['Site Address'] }])
  b.gridRow([{ frac: 1, label: 'NIFPS DETAILS:', fill: COLORS.grayBg }])
  b.gridRow([
    { frac: 0.4, label: 'Sr.No:', value: by['Sr. No'] },
    { frac: 0.6, label: 'Variant (Single Cylinder/Double Cylinder):', value: variant(by) },
  ])
  b.gridRow([
    { frac: 0.5, label: 'Date of commissioning:', value: fmtVal(by['Date of commissioning']) },
    { frac: 0.5, label: 'Year of Mfg:', value: by['Year of Mfg'] },
  ])
  b.gridRow([{ frac: 1, label: 'Location of installation:', value: checkedLocations(by) }])
  b.gridRow([{ frac: 1, label: 'Transformer Details:', fill: COLORS.grayBg }])
  b.gridRow([{ frac: 1, label: 'Transformer No:', value: by['Transformer No'] }])
  b.gridRow([
    { frac: 0.4, label: 'Manufacturer:', value: by['Manufacturer'] },
    { frac: 0.35, label: 'Serial Number:', value: by['Serial Number'] },
    { frac: 0.25, label: 'Year of Mfg.:', value: by['Year of Mfg.'] },
  ])
  b.gridRow([
    { frac: 0.4, label: 'Rating of Transformer:', value: by['Rating of Transformer'] },
    { frac: 0.3, label: 'KV Class:', value: by['KV Class'] },
    { frac: 0.3, label: 'Date of Commissioning:', value: fmtVal(by['Date of Commissioning']) },
  ])

  // ── Service details ──
  b.sectionBar('NIFPS System Installation and Commissioning / Service details:')
  b.numberedRows(serviceRows(params))

  // ── Remarks ──
  b.gridRow([{ frac: 1, label: 'Remarks if Any:', value: by['Remarks if Any'] }], 40)

  // ── Sign-off ──
  b.signoffTwoParty(
    {
      title: 'For Customer',
      headerFill: COLORS.blue,
      rows: [
        ['Name:', by['Customer Name'] || ''],
        ['Designation:', by['Customer Designation'] || ''],
        ['Mob no:', by['Customer Phone No.'] || ''],
        ['Email id:', by['Customer Email'] || ''],
      ],
      sig: params.clientSignature,
    },
    {
      title: 'For Easun-MR',
      headerFill: COLORS.red,
      rows: [
        ['Name:', by['Field Engineer Name'] || params.engineerName || ''],
        ['Designation:', by['Field Engineer Designation'] || ''],
        ['Mob no:', by['Field Engineer Phone No.'] || ''],
        ['Email id:', by['Field Engineer Email'] || ''],
      ],
      sig: params.engineerSignature,
    },
  )

  // ── Footer ──
  b.footerAddresses([
    { heading: 'Plant -I', lines: ['612, (232) C.T.H. Road', 'Thiruninravur – 602 024', 'Chennai, India', 'service.nifps@easunmr.com'] },
    { heading: 'Plant -II', lines: ['20/2, 20/5, Perumal Koil Street,', 'Thirubuvanai – 605 107', 'Pondicherry, India', 'www.easunmr.com'] },
  ])

  return b.finish()
}

// ───────────────────────────── Word ─────────────────────────────

const MARGINS = { top: 40, bottom: 40, left: 80, right: 80 }

function wGridCell(label: string, value: string, opts: { fill?: string; width?: number; align?: (typeof AlignmentType)[keyof typeof AlignmentType] } = {}): TableCell {
  const runs = [new TextRun({ text: label, bold: true, size: 18 })]
  if (value) runs.push(new TextRun({ text: ` ${value}`, size: 18 }))
  return new TableCell({
    borders: CELL_BORDERS,
    width: opts.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
    shading: opts.fill ? { type: ShadingType.CLEAR, fill: opts.fill.replace('#', ''), color: 'auto' } : undefined,
    verticalAlign: VerticalAlign.CENTER,
    margins: MARGINS,
    children: [new Paragraph({ alignment: opts.align, children: runs })],
  })
}

// A one-row framed table matching a PDF gridRow.
function wGridRow(cells: { width: number; label: string; value?: string; fill?: string; align?: (typeof AlignmentType)[keyof typeof AlignmentType] }[]): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    columnWidths: cells.map(c => Math.round((c.width / 100) * 8700)),
    rows: [new TableRow({ children: cells.map(c => wGridCell(c.label, c.value || '', { fill: c.fill, width: c.width, align: c.align })) })],
  })
}

export async function generateNifpsWcrWord(params: VisitPdfParams): Promise<Buffer> {
  const by = buildByLabel(params)
  const children: (Paragraph | Table)[] = []

  children.push(wLetterhead())
  children.push(new Paragraph({ text: '' }))

  children.push(wGridRow([{ width: 100, label: 'WORK COMPLETION REPORT', align: AlignmentType.CENTER }]))
  children.push(wGridRow([
    { width: 70, label: 'Customer Name:', value: by['Customer Name'] },
    { width: 30, label: 'Date:', value: fmtVal(by['Date']) },
  ]))
  children.push(wGridRow([{ width: 100, label: 'Site Address:', value: by['Site Address'] }]))
  children.push(wGridRow([{ width: 100, label: 'NIFPS DETAILS:', fill: COLORS.grayBg }]))
  children.push(wGridRow([
    { width: 40, label: 'Sr.No:', value: by['Sr. No'] },
    { width: 60, label: 'Variant (Single Cylinder/Double Cylinder):', value: variant(by) },
  ]))
  children.push(wGridRow([
    { width: 50, label: 'Date of commissioning:', value: fmtVal(by['Date of commissioning']) },
    { width: 50, label: 'Year of Mfg:', value: by['Year of Mfg'] },
  ]))
  children.push(wGridRow([{ width: 100, label: 'Location of installation:', value: checkedLocations(by) }]))
  children.push(wGridRow([{ width: 100, label: 'Transformer Details:', fill: COLORS.grayBg }]))
  children.push(wGridRow([{ width: 100, label: 'Transformer No:', value: by['Transformer No'] }]))
  children.push(wGridRow([
    { width: 40, label: 'Manufacturer:', value: by['Manufacturer'] },
    { width: 35, label: 'Serial Number:', value: by['Serial Number'] },
    { width: 25, label: 'Year of Mfg.:', value: by['Year of Mfg.'] },
  ]))
  children.push(wGridRow([
    { width: 40, label: 'Rating of Transformer:', value: by['Rating of Transformer'] },
    { width: 30, label: 'KV Class:', value: by['KV Class'] },
    { width: 30, label: 'Date of Commissioning:', value: fmtVal(by['Date of Commissioning']) },
  ]))
  children.push(new Paragraph({ text: '' }))

  children.push(wSectionBar('NIFPS System Installation and Commissioning / Service details:'))
  children.push(wNumberedRows(serviceRows(params)))
  children.push(new Paragraph({ text: '' }))

  children.push(wGridRow([{ width: 100, label: 'Remarks if Any:', value: by['Remarks if Any'] }]))
  children.push(new Paragraph({ text: '' }))

  children.push(wSignoffTwoParty(
    {
      title: 'For Customer',
      headerFill: COLORS.blue,
      rows: [
        ['Name:', by['Customer Name'] || ''],
        ['Designation:', by['Customer Designation'] || ''],
        ['Mob no:', by['Customer Phone No.'] || ''],
        ['Email id:', by['Customer Email'] || ''],
      ],
      sig: params.clientSignature,
    },
    {
      title: 'For Easun-MR',
      headerFill: COLORS.red,
      rows: [
        ['Name:', by['Field Engineer Name'] || params.engineerName || ''],
        ['Designation:', by['Field Engineer Designation'] || ''],
        ['Mob no:', by['Field Engineer Phone No.'] || ''],
        ['Email id:', by['Field Engineer Email'] || ''],
      ],
      sig: params.engineerSignature,
    },
  ))

  // Footer as plain paragraphs.
  children.push(new Paragraph({ text: '' }))
  children.push(new Paragraph({ spacing: { before: 120 }, children: [new TextRun({ text: 'Plant -I  ', bold: true, color: 'D5271F', size: 18 }), new TextRun({ text: '612, (232) C.T.H. Road, Thiruninravur – 602 024, Chennai, India, service.nifps@easunmr.com', size: 16, color: '333333' })] }))
  children.push(new Paragraph({ children: [new TextRun({ text: 'Plant -II  ', bold: true, color: 'D5271F', size: 18 }), new TextRun({ text: '20/2, 20/5, Perumal Koil Street, Thirubuvanai – 605 107, Pondicherry, India, www.easunmr.com', size: 16, color: '333333' })] }))

  const doc = new Document({ sections: [{ children }] })
  return Packer.toBuffer(doc)
}
