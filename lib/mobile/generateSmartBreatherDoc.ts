import { Document, Packer, Paragraph, Table } from 'docx'
import { PdfBuilder } from './docPdfKit'
import {
  wLetterhead, wTitle, wSectionBar, wTable, wCheckboxGroup, wKvLine, wSignoffTwoParty,
} from './docDocxKit'
import { buildByLabel, fmtVal, rowStatusLabel, COLORS } from './docShared'
import type { VisitPdfParams } from './generateVisitPdf'

// Dedicated renderer for the "Smart Breather Site Inspection Report" form —
// reproduces the bespoke paper template (EMR letterhead, job/installation detail
// grid, visit-stage checkboxes, five inspection/observation checklists, a
// functional-test table, findings/photograph/assessment blocks, and the blue
// CUSTOMER / red FIELD ENGINEER sign-off) filled with the engineer's submitted data.

const TITLE = 'SMART BREATHER SITE INSPECTION REPORT'

// One observation section's table (Check Points / Observation / Remarks).
function observationRows(params: VisitPdfParams, title: string): string[][] | null {
  const sec = params.sections.find(s => s.title === title)
  const table = sec?.tables?.[0]
  if (!table) return null
  return table.rows.map(r => [
    r.row_label,
    rowStatusLabel(params.rowValues[r.id]?.status || '', table.col1Label, table.col2Label),
    params.rowValues[r.id]?.remarks || '',
  ])
}

// Functional-test section's table (Test Description / Result).
function functionalRows(params: VisitPdfParams, title: string): string[][] | null {
  const sec = params.sections.find(s => s.title === title)
  const table = sec?.tables?.[0]
  if (!table) return null
  return table.rows.map(r => [
    r.row_label,
    rowStatusLabel(params.rowValues[r.id]?.status || '', table.col1Label, table.col2Label),
  ])
}

const OBS_SECTIONS = [
  '1. Visual Inspection',
  '2. Piping & Air Circuit Inspection',
  '3. Electrical Inspection',
  '4. Communication Inspection',
]

const PHOTO_LABELS = [
  'Smart Breather Front View',
  'Electrical Connections',
  'Conservator Connection',
  'Separate Earthing',
  'Display/Sensor Readings',
]

// ───────────────────────────── PDF ─────────────────────────────

export function generateSmartBreatherPdf(params: VisitPdfParams): Promise<Buffer> {
  const by = buildByLabel(params)
  const b = new PdfBuilder({ margin: 40 })

  // Letterhead + title
  b.logoLeftWithPill()
  b.title(TITLE)
  b.gap(6)

  // Job and installation information
  b.sectionBar('JOB AND INSTALLATION INFORMATION')
  b.table(
    [{ header: 'Particulars', frac: 0.5 }, { header: 'Details', frac: 0.5 }],
    [
      ['Smart Breather Serial No.', by['Smart Breather Serial No.'] || ''],
      ['Substation/Location', by['Substation/Location'] || ''],
      ['Transformer Rating/Make', by['Transformer Rating/Make'] || ''],
      ['Transformer Serial No.', by['Transformer Serial No.'] || ''],
      ['Date of Inspection', fmtVal(by['Date of Inspection'])],
      ['Inspected By', by['Inspected By'] || ''],
      ['Witnessed By', by['Witnessed By'] || ''],
      ['Transformer with Air cell / Free Breathing', by['Transformer with Air cell / Free Breathing'] || ''],
      ['PPM recorded before Smart Breather and most recent measurement', by['PPM recorded before Smart Breather and most recent measurement'] || ''],
    ],
  )
  b.gap(8)

  // Visit stage
  b.checkboxGroup([
    { label: 'Installation', checked: by['Installation'] === 'true' },
    { label: 'Pre-Commissioning Stage', checked: by['Pre-Commissioning Stage'] === 'true' },
    { label: 'Commissioning', checked: by['Commissioning'] === 'true' },
    { label: 'Troubleshooting Visit', checked: by['Troubleshooting Visit'] === 'true' },
  ])
  b.gap(6)

  // Inspection checklists (1–4)
  for (const title of OBS_SECTIONS) {
    b.sectionBar(title)
    const rows = observationRows(params, title)
    if (rows) {
      b.table(
        [
          { header: 'Check Points', frac: 0.6 },
          { header: 'Observation', frac: 0.18 },
          { header: 'Remarks', frac: 0.22 },
        ],
        rows,
      )
    }
    b.gap(6)
  }

  // 5. Functional Test
  b.sectionBar('5. Functional Test')
  const funcRows = functionalRows(params, '5. Functional Test')
  if (funcRows) {
    b.table(
      [{ header: 'Test Description', frac: 0.7 }, { header: 'Result', frac: 0.3 }],
      funcRows,
    )
  }
  if (by['Note']) b.kvLine('NOTE:', by['Note'])
  b.gap(6)

  // 6. Inspection Findings & LED Indication
  b.sectionBar('6. Inspection Findings & LED Indication')
  b.kvLine('Inspection Findings:', by['Inspection Findings'] || '')
  b.kvLine('LED Indication Status Check:', by['LED Indication Status Check'] || '')
  b.gap(6)

  // 7. Photographs
  b.sectionBar('7. Photographs')
  b.numberedRows(PHOTO_LABELS)
  b.gap(6)

  // 8. Final Assessment / Recommendations of Spares
  b.sectionBar('8. Final Assessment / Recommendations of Spares')
  b.kvLine('', by['Final Assessment / Recommendations of Spares'] || '')
  b.gap(10)

  // Sign-off
  b.signoffTwoParty(
    {
      title: 'CUSTOMER',
      headerFill: COLORS.blue,
      rows: [
        ['Name:', by['Customer Name'] || params.clientName || ''],
        ['Ph No:', by['Customer Phone No.'] || ''],
        ['Date:', fmtVal(by['Date'])],
      ],
      sig: params.clientSignature,
    },
    {
      title: 'FIELD ENGINEER',
      headerFill: COLORS.red,
      rows: [
        ['Name:', by['Field Engineer Name'] || params.engineerName || ''],
        ['Ph No:', ''],
      ],
      sig: params.engineerSignature,
    },
  )

  return b.finish()
}

// ───────────────────────────── Word ─────────────────────────────

export async function generateSmartBreatherWord(params: VisitPdfParams): Promise<Buffer> {
  const by = buildByLabel(params)
  const children: (Paragraph | Table)[] = []

  // Letterhead + title
  children.push(wLetterhead())
  children.push(wTitle(TITLE))

  // Job and installation information
  children.push(wSectionBar('JOB AND INSTALLATION INFORMATION'))
  children.push(wTable(
    ['Particulars', 'Details'],
    [
      ['Smart Breather Serial No.', by['Smart Breather Serial No.'] || ''],
      ['Substation/Location', by['Substation/Location'] || ''],
      ['Transformer Rating/Make', by['Transformer Rating/Make'] || ''],
      ['Transformer Serial No.', by['Transformer Serial No.'] || ''],
      ['Date of Inspection', fmtVal(by['Date of Inspection'])],
      ['Inspected By', by['Inspected By'] || ''],
      ['Witnessed By', by['Witnessed By'] || ''],
      ['Transformer with Air cell / Free Breathing', by['Transformer with Air cell / Free Breathing'] || ''],
      ['PPM recorded before Smart Breather and most recent measurement', by['PPM recorded before Smart Breather and most recent measurement'] || ''],
    ],
  ))

  // Visit stage
  children.push(wCheckboxGroup([
    { label: 'Installation', checked: by['Installation'] === 'true' },
    { label: 'Pre-Commissioning Stage', checked: by['Pre-Commissioning Stage'] === 'true' },
    { label: 'Commissioning', checked: by['Commissioning'] === 'true' },
    { label: 'Troubleshooting Visit', checked: by['Troubleshooting Visit'] === 'true' },
  ]))

  // Inspection checklists (1–4)
  for (const title of OBS_SECTIONS) {
    children.push(wSectionBar(title))
    const rows = observationRows(params, title)
    if (rows) children.push(wTable(['Check Points', 'Observation', 'Remarks'], rows))
  }

  // 5. Functional Test
  children.push(wSectionBar('5. Functional Test'))
  const funcRows = functionalRows(params, '5. Functional Test')
  if (funcRows) children.push(wTable(['Test Description', 'Result'], funcRows))
  if (by['Note']) children.push(wKvLine('NOTE:', by['Note']))

  // 6. Inspection Findings & LED Indication
  children.push(wSectionBar('6. Inspection Findings & LED Indication'))
  children.push(wKvLine('Inspection Findings:', by['Inspection Findings'] || ''))
  children.push(wKvLine('LED Indication Status Check:', by['LED Indication Status Check'] || ''))

  // 7. Photographs
  children.push(wSectionBar('7. Photographs'))
  PHOTO_LABELS.forEach((label, i) => children.push(wKvLine(`${i + 1}.`, label)))

  // 8. Final Assessment / Recommendations of Spares
  children.push(wSectionBar('8. Final Assessment / Recommendations of Spares'))
  children.push(wKvLine('', by['Final Assessment / Recommendations of Spares'] || ''))

  // Sign-off
  children.push(wSignoffTwoParty(
    {
      title: 'CUSTOMER',
      headerFill: COLORS.blue,
      rows: [
        ['Name:', by['Customer Name'] || params.clientName || ''],
        ['Ph No:', by['Customer Phone No.'] || ''],
        ['Date:', fmtVal(by['Date'])],
      ],
      sig: params.clientSignature,
    },
    {
      title: 'FIELD ENGINEER',
      headerFill: COLORS.red,
      rows: [
        ['Name:', by['Field Engineer Name'] || params.engineerName || ''],
        ['Ph No:', ''],
      ],
      sig: params.engineerSignature,
    },
  ))

  const doc = new Document({ sections: [{ children }] })
  return Packer.toBuffer(doc)
}
