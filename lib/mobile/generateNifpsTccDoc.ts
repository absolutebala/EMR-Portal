import { Document, Packer, Paragraph, TextRun, Table } from 'docx'
import { PdfBuilder } from './docPdfKit'
import { buildByLabel, fmtVal, rowStatusLabel } from './docShared'
import {
  wLetterhead, wTitle, wKvLine, wTable, wSignoffStacked,
} from './docDocxKit'
import type { VisitPdfParams } from './generateVisitPdf'

// Dedicated renderer for the "NIFPS Testing and Commissioning Report" form —
// reproduces the bespoke multi-page checklist template (EMR letterhead with the logo
// top-right, centred title, a block of report-detail key/value lines, one combined
// checklist table whose rows are grouped by roman-numbered section, and a stacked
// two-party sign-off) filled with the engineer's submitted data.

const TITLE = 'NIFPS TESTING AND COMMISSIONING REPORT'

// Sections that map to a group in the combined checklist, in template order. Each
// entry is [form section title, roman numeral / prefix, printed group heading].
const GROUPS: [string, string, string][] = [
  ['I. Checks before test', 'I', 'Below checks to be done before test'],
  ['II. Shutter Valve', 'II', 'SHUTTER VALVE'],
  ['III. Signal Box', 'III', 'SIGNAL BOX'],
  ['IV. Control Panel', 'IV', 'CONTROL PANEL'],
  ['V. Switchyard Cubicle', 'V', 'SWITCHYARD CUBICLE'],
  ['VI. Modes of Operation', 'VI', 'MODES OF OPERATION'],
  ['General Checks', '', 'General Checks'],
]

// Walks the form sections in template order and builds the flat string[][] rows for
// the single combined checklist table (shared by the PDF and Word renderers).
function buildChecklistRows(params: VisitPdfParams, by: Record<string, string>): string[][] {
  const rows: string[][] = []
  for (const [sectionTitle, numeral, heading] of GROUPS) {
    rows.push([numeral, heading, ''])
    const sec = params.sections.find(s => s.title === sectionTitle)
    const table = sec?.tables[0]
    if (table) {
      for (const r of table.rows) {
        const sno = r.sno_label || ''
        const observation = rowStatusLabel(params.rowValues[r.id]?.status || '')
        rows.push([sno, r.row_label, observation])
      }
    }
    // Control Panel carries two extra text fields printed after its table rows.
    if (sectionTitle === 'IV. Control Panel') {
      rows.push(['', 'PLC Version: ' + (by['PLC Version'] || '') + '    HMI Version: ' + (by['HMI Version'] || ''), ''])
    }
  }
  return rows
}

// ───────────────────────────── PDF ─────────────────────────────

export function generateNifpsTccPdf(params: VisitPdfParams): Promise<Buffer> {
  const by = buildByLabel(params)
  const b = new PdfBuilder({ margin: 40 })

  // Letterhead: EMR logo top-right, then the centred report title.
  b.logoRight()
  b.title(TITLE)
  b.gap(6)

  // Report detail key/value lines.
  b.kvLine('Customer :', by['Customer'] || '')
  b.kvLine('End user :', by['End user'] || '')
  b.kvLine('EMR W.O. No :', by['EMR W.O. No'] || '')
  b.kvLine('Quantity :', by['Quantity'] || '')
  b.kvLine('Installation Location :', by['Installation Location'] || '')
  b.kvLine('Project Details, If any :', by['Project Details, If any'] || '')
  b.kvLine('Transformer Details : Manufacturer :', by['Transformer Manufacturer'] || '')
  b.kvLine('Rating of Transformer :', by['Rating of Transformer'] || '')
  b.kvLine('Date of Commissioning :', fmtVal(by['Date of Commissioning']))
  b.kvLine('Serial Number :', by['Serial Number'] || '')
  b.gap(8)

  // Combined checklist table.
  const cols = [
    { header: 'S.NO', frac: 0.10 },
    { header: 'DETAILS OF CHECKS/TESTS', frac: 0.72 },
    { header: 'OBSERVATION\n(YES/NO)', frac: 0.18 },
  ]
  b.table(cols, buildChecklistRows(params, by))
  b.gap(12)

  // Sign-off.
  b.signoffStacked([
    {
      title: 'Customer Representative',
      rows: [
        ['Name:', by['Customer Name'] || ''],
        ['Designation:', by['Customer Designation'] || ''],
        ['Date:', fmtVal(by['Customer Sign-off Date'])],
      ],
      sig: params.clientSignature,
    },
    {
      title: 'Easun – MR Representative',
      rows: [
        ['Name:', by['Field Engineer Name'] || params.engineerName || ''],
        ['Designation:', by['Field Engineer Designation'] || ''],
        ['Date:', fmtVal(by['Field Engineer Sign-off Date'])],
      ],
      sig: params.engineerSignature,
    },
  ])

  // Footer addresses.
  b.footerAddresses([
    { heading: 'UNIT -I', lines: ['612, (232) C.T.H. Road', 'Thiruninravur – 602 024', 'Chennai, India', 'service.nifps@easunmr.com'] },
    { heading: 'UNIT –II', lines: ['20/2, 20/5, Perumal Koil Street,', 'Thirubuvanai – 605 107', 'Puducherry, India'] },
  ], 'www.easunmr.com')

  return b.finish()
}

// ───────────────────────────── Word ─────────────────────────────

export async function generateNifpsTccWord(params: VisitPdfParams): Promise<Buffer> {
  const by = buildByLabel(params)
  const children: (Paragraph | Table)[] = []

  // Letterhead + title.
  children.push(wLetterhead())
  children.push(wTitle(TITLE))

  // Report detail key/value lines.
  children.push(wKvLine('Customer :', by['Customer'] || ''))
  children.push(wKvLine('End user :', by['End user'] || ''))
  children.push(wKvLine('EMR W.O. No :', by['EMR W.O. No'] || ''))
  children.push(wKvLine('Quantity :', by['Quantity'] || ''))
  children.push(wKvLine('Installation Location :', by['Installation Location'] || ''))
  children.push(wKvLine('Project Details, If any :', by['Project Details, If any'] || ''))
  children.push(wKvLine('Transformer Details : Manufacturer :', by['Transformer Manufacturer'] || ''))
  children.push(wKvLine('Rating of Transformer :', by['Rating of Transformer'] || ''))
  children.push(wKvLine('Date of Commissioning :', fmtVal(by['Date of Commissioning'])))
  children.push(wKvLine('Serial Number :', by['Serial Number'] || ''))
  children.push(new Paragraph({ text: '' }))

  // Combined checklist table.
  children.push(wTable(
    ['S.NO', 'DETAILS OF CHECKS/TESTS', 'OBSERVATION (YES/NO)'],
    buildChecklistRows(params, by),
    [900, 6500, 1600],
  ))
  children.push(new Paragraph({ text: '' }))

  // Sign-off.
  children.push(...wSignoffStacked([
    {
      title: 'Customer Representative',
      rows: [
        ['Name:', by['Customer Name'] || ''],
        ['Designation:', by['Customer Designation'] || ''],
        ['Date:', fmtVal(by['Customer Sign-off Date'])],
      ],
      sig: params.clientSignature,
    },
    {
      title: 'Easun – MR Representative',
      rows: [
        ['Name:', by['Field Engineer Name'] || params.engineerName || ''],
        ['Designation:', by['Field Engineer Designation'] || ''],
        ['Date:', fmtVal(by['Field Engineer Sign-off Date'])],
      ],
      sig: params.engineerSignature,
    },
  ]))

  // Footer addresses as plain paragraphs.
  children.push(new Paragraph({ text: '' }))
  children.push(new Paragraph({ children: [new TextRun({ text: 'UNIT -I', bold: true, size: 18, color: 'D5271F' })] }))
  for (const ln of ['612, (232) C.T.H. Road', 'Thiruninravur – 602 024', 'Chennai, India', 'service.nifps@easunmr.com']) {
    children.push(new Paragraph({ children: [new TextRun({ text: ln, size: 16 })] }))
  }
  children.push(new Paragraph({ children: [new TextRun({ text: 'UNIT –II', bold: true, size: 18, color: 'D5271F' })] }))
  for (const ln of ['20/2, 20/5, Perumal Koil Street,', 'Thirubuvanai – 605 107', 'Puducherry, India']) {
    children.push(new Paragraph({ children: [new TextRun({ text: ln, size: 16 })] }))
  }
  children.push(new Paragraph({ children: [new TextRun({ text: 'www.easunmr.com', size: 16, color: '2F6FE0' })] }))

  const doc = new Document({ sections: [{ children }] })
  return Packer.toBuffer(doc)
}
