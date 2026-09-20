import { Document, Packer, Paragraph, Table } from 'docx'
import { PdfBuilder } from './docPdfKit'
import { buildByLabel, fmtVal, COLORS } from './docShared'
import {
  wLetterhead, wTitle, wSubtitle, wNumberedSection, wKvLine,
  wCheckboxGroup, wSignoffTwoParty,
} from './docDocxKit'
import type { VisitPdfParams } from './generateVisitPdf'

// Dedicated renderer for the "Incident Report" form — reproduces the bespoke paper
// template (left-aligned EMR letterhead + rule, centred title/subtitle, red numbered
// sections with label/value lines and checkbox groups, and a two-party CUSTOMER / EMR
// sign-off block) filled with the engineer's submitted data.

const SUBTITLE = 'Ref.MR: ALL99004.doc  ·  TS4-Dr 08.03.00'

const isOn = (by: Record<string, string>, label: string) => by[label] === 'true'

// ───────────────────────────── PDF ─────────────────────────────

export function generateIncidentPdf(params: VisitPdfParams): Promise<Buffer> {
  const by = buildByLabel(params)
  const b = new PdfBuilder({ margin: 40 })

  // Letterhead: logo top-left, then a rule.
  b.logoLeftWithPill()
  b.rule()
  b.title('Incident Report')
  b.subtitle(SUBTITLE)

  const cb = (items: { label: string; field: string }[]) =>
    b.checkboxGroup(items.map(it => ({ label: it.label, checked: isOn(by, it.field) })))

  // 1 Service Engineer
  b.numberedSection('1', 'Service Engineer')
  b.kvLine('Service engineer name:', by['Service Engineer Name'] || '')
  b.kvLine('Date:', fmtVal(by['Date']))

  // 2 Transformer details
  b.numberedSection('2', 'Transformer details')
  b.kvLine('Manufacturer:', by['Manufacturer'] || '')
  b.kvLine('Serial no:', by['Serial No'] || '')
  cb([
    { label: 'Power station', field: 'Power station' },
    { label: 'Net work', field: 'Network' },
    { label: 'Furnace', field: 'Furnace' },
    { label: 'Electrolysis', field: 'Electrolysis' },
  ])
  b.kvLine('Power (MVA):', by['Power (MVA)'] || '')
  b.kvLine('Load %:', by['Load %'] || '')
  b.kvLine('Current (A):', by['Current (A)'] || '')
  b.kvLine('Um (kV):', by['Um (kV)'] || '')
  cb([
    { label: 'Y', field: 'Y' },
    { label: 'Delta (HV)', field: 'Delta (HV)' },
    { label: 'Delta (LV)', field: 'Delta (LV)' },
    { label: 'Autotransf.', field: 'Autotransformer' },
    { label: 'Intermediate circuit', field: 'Intermediate circuit' },
  ])
  cb([
    { label: 'Y-point insulated', field: 'Y-point insulated' },
    { label: 'Y-point ground', field: 'Y-point ground' },
    { label: 'Y-point other', field: 'Y-point other' },
  ])
  b.kvLine('Date of commissioning:', fmtVal(by['Date of commissioning']))

  // 3 Tap changer details
  b.numberedSection('3', 'Tap changer details')
  b.kvLine('Type:', by['Type'] || '')
  b.kvLine('Serial no:', by['Serial No'] || '')
  b.kvLine('Actual number of operations:', by['Actual number of operations'] || '')
  b.kvLine('Last inspection date:', fmtVal(by['Last inspection date']))
  b.kvLine('Number of operations:', by['Number of operations'] || '')
  b.kvLine('Carried out by:', by['Carried out by'] || '')
  b.kvLine('Last oil replacement date:', fmtVal(by['Last oil replacement date']))
  b.kvLine('BDV at replacement (KV/2.5mm):', by['BDV at replacement (KV/2.5mm)'] || '')
  b.kvLine('No. of operations per day:', by['No. of operations per day'] || '')

  // 4 Description of incident
  b.numberedSection('4', 'Description of incident')
  b.kvLine('Description:', by['Description'] || '')
  b.kvLine('Incident date:', fmtVal(by['Incident date']))
  b.kvLine('Hour:', by['Hour'] || '')
  cb([{ label: 'During tap change', field: 'During tap change' }])
  b.kvLine('From position:', by['From position'] || '')
  b.kvLine('To position:', by['To position'] || '')
  b.kvLine('Last op. from:', by['Last op. from'] || '')
  b.kvLine('Last op. to:', by['Last op. to'] || '')
  b.kvLine('Last op. date:', fmtVal(by['Last op. date']))
  b.kvLine('Last op. hour:', by['Last op. hour'] || '')
  b.kvLine('Position on tap changer head:', by['Position on tap changer head'] || '')
  b.kvLine('On motor drive unit:', by['On motor drive unit'] || '')
  cb([
    { label: 'Buchholz alarm', field: 'Buchholz alarm' },
    { label: 'Buchholz tripping', field: 'Buchholz tripping' },
    { label: 'Differential protection', field: 'Differential protection' },
    { label: 'Qualitral (transformer)', field: 'Qualitral (transformer)' },
    { label: 'Distance protection', field: 'Distance protection' },
    { label: 'Over current protection', field: 'Over current protection' },
    { label: 'Over voltage protection', field: 'Over voltage protection' },
    { label: 'Lightning arrester', field: 'Lightning arrester' },
  ])
  b.kvLine('Arrester counter reading:', by['Arrester counter reading'] || '')
  b.kvLine('Fault recorder records:', by['Fault recorder records'] || '')

  // 5 Protective devices of the tap changer
  b.numberedSection('5', 'Protective devices of the tap changer')
  cb([
    { label: 'DW 2000', field: 'DW 2000' },
    { label: 'Qualitrol', field: 'Qualitrol' },
    { label: 'RS 1000', field: 'RS 1000' },
    { label: 'RS 2001', field: 'RS 2001' },
  ])
  cb([
    { label: 'Flap after incident: ON', field: 'Flap after incident: ON' },
    { label: 'Flap after incident: OFF', field: 'Flap after incident: OFF' },
  ])
  b.kvLine('Inclination of pipe (relay to conservator):', by['Inclination of pipe (relay to conservator)'] || '')
  b.kvLine('Sketch / photo notes:', by['Sketch / photo notes'] || '')
  cb([
    { label: 'Conservators together', field: 'Conservators together' },
    { label: 'Conservators separate', field: 'Conservators separate' },
  ])
  cb([
    { label: 'Oil contact w/ atmosphere: together', field: 'Oil contact w/ atmosphere: together' },
    { label: 'Oil contact w/ atmosphere: separate', field: 'Oil contact w/ atmosphere: separate' },
  ])
  b.kvLine('Silica gel / pressure valve / nitrogen (setting value):', by['Silica gel / pressure valve / nitrogen (setting value)'] || '')
  cb([
    { label: 'Flap valve: Left', field: 'Flap valve: Left' },
    { label: 'Flap valve: Center', field: 'Flap valve: Center' },
  ])
  b.kvLine('Dimension of valve opening:', by['Dimension of valve opening'] || '')
  cb([
    { label: 'Tripping: HV circuit break', field: 'Tripping: HV circuit break' },
    { label: 'Tripping: other', field: 'Tripping: other' },
  ])
  cb([{ label: 'Oil filter installed', field: 'Oil filter installed' }])
  b.kvLine('Operating pressure on gauge (bar):', by['Operating pressure on gauge (bar)'] || '')

  // 6 Data of network and substation
  b.numberedSection('6', 'Data of network and substation')
  cb([
    { label: 'HV side: Cable', field: 'HV side: Cable' },
    { label: 'HV side: Overhead line', field: 'HV side: Overhead line' },
    { label: 'HV side: Other', field: 'HV side: Other' },
  ])
  cb([
    { label: 'LV side: Cable', field: 'LV side: Cable' },
    { label: 'LV side: Overhead line', field: 'LV side: Overhead line' },
    { label: 'LV side: Other', field: 'LV side: Other' },
  ])

  // 7 Additional information
  b.numberedSection('7', 'Additional information')
  b.kvLine('Irregularities noticed before the incident:', by['Irregularities noticed before the incident'] || '')
  b.kvLine('Further circumstances known:', by['Further circumstances known'] || '')
  b.kvLine('Steps taken directly after the incident:', by['Steps taken directly after the incident'] || '')
  b.kvLine('Dielectric strength (kV/2.5mm):', by['Dielectric strength (kV/2.5mm)'] || '')
  b.kvLine('Water content (ppm):', by['Water content (ppm)'] || '')
  b.kvLine('Oil temp. during sampling (deg C):', by['Oil temp. during sampling (deg C)'] || '')
  b.kvLine('Results of tap changer check:', by['Results of tap changer check'] || '')
  b.kvLine('Photograph notes (if damaged):', by['Photograph notes (if damaged)'] || '')

  // Sign-off
  b.gap(10)
  b.signoffTwoParty(
    { title: 'CUSTOMER', headerFill: COLORS.blue, rows: [['Name:', by['Customer Name'] || params.clientName || '']], sig: params.clientSignature },
    { title: 'EMR', headerFill: COLORS.red, rows: [['Name:', by['Field Engineer Name'] || params.engineerName || '']], sig: params.engineerSignature },
  )

  return b.finish()
}

// ───────────────────────────── Word ─────────────────────────────

export async function generateIncidentWord(params: VisitPdfParams): Promise<Buffer> {
  const by = buildByLabel(params)
  const children: (Paragraph | Table)[] = []

  const cb = (items: { label: string; field: string }[]) =>
    children.push(wCheckboxGroup(items.map(it => ({ label: it.label, checked: isOn(by, it.field) }))))
  const kv = (label: string, value: string) => children.push(wKvLine(label, value))

  // Letterhead + title
  children.push(wLetterhead())
  children.push(wTitle('Incident Report'))
  children.push(wSubtitle(SUBTITLE))

  // 1 Service Engineer
  children.push(wNumberedSection('1', 'Service Engineer'))
  kv('Service engineer name:', by['Service Engineer Name'] || '')
  kv('Date:', fmtVal(by['Date']))

  // 2 Transformer details
  children.push(wNumberedSection('2', 'Transformer details'))
  kv('Manufacturer:', by['Manufacturer'] || '')
  kv('Serial no:', by['Serial No'] || '')
  cb([
    { label: 'Power station', field: 'Power station' },
    { label: 'Net work', field: 'Network' },
    { label: 'Furnace', field: 'Furnace' },
    { label: 'Electrolysis', field: 'Electrolysis' },
  ])
  kv('Power (MVA):', by['Power (MVA)'] || '')
  kv('Load %:', by['Load %'] || '')
  kv('Current (A):', by['Current (A)'] || '')
  kv('Um (kV):', by['Um (kV)'] || '')
  cb([
    { label: 'Y', field: 'Y' },
    { label: 'Delta (HV)', field: 'Delta (HV)' },
    { label: 'Delta (LV)', field: 'Delta (LV)' },
    { label: 'Autotransf.', field: 'Autotransformer' },
    { label: 'Intermediate circuit', field: 'Intermediate circuit' },
  ])
  cb([
    { label: 'Y-point insulated', field: 'Y-point insulated' },
    { label: 'Y-point ground', field: 'Y-point ground' },
    { label: 'Y-point other', field: 'Y-point other' },
  ])
  kv('Date of commissioning:', fmtVal(by['Date of commissioning']))

  // 3 Tap changer details
  children.push(wNumberedSection('3', 'Tap changer details'))
  kv('Type:', by['Type'] || '')
  kv('Serial no:', by['Serial No'] || '')
  kv('Actual number of operations:', by['Actual number of operations'] || '')
  kv('Last inspection date:', fmtVal(by['Last inspection date']))
  kv('Number of operations:', by['Number of operations'] || '')
  kv('Carried out by:', by['Carried out by'] || '')
  kv('Last oil replacement date:', fmtVal(by['Last oil replacement date']))
  kv('BDV at replacement (KV/2.5mm):', by['BDV at replacement (KV/2.5mm)'] || '')
  kv('No. of operations per day:', by['No. of operations per day'] || '')

  // 4 Description of incident
  children.push(wNumberedSection('4', 'Description of incident'))
  kv('Description:', by['Description'] || '')
  kv('Incident date:', fmtVal(by['Incident date']))
  kv('Hour:', by['Hour'] || '')
  cb([{ label: 'During tap change', field: 'During tap change' }])
  kv('From position:', by['From position'] || '')
  kv('To position:', by['To position'] || '')
  kv('Last op. from:', by['Last op. from'] || '')
  kv('Last op. to:', by['Last op. to'] || '')
  kv('Last op. date:', fmtVal(by['Last op. date']))
  kv('Last op. hour:', by['Last op. hour'] || '')
  kv('Position on tap changer head:', by['Position on tap changer head'] || '')
  kv('On motor drive unit:', by['On motor drive unit'] || '')
  cb([
    { label: 'Buchholz alarm', field: 'Buchholz alarm' },
    { label: 'Buchholz tripping', field: 'Buchholz tripping' },
    { label: 'Differential protection', field: 'Differential protection' },
    { label: 'Qualitral (transformer)', field: 'Qualitral (transformer)' },
    { label: 'Distance protection', field: 'Distance protection' },
    { label: 'Over current protection', field: 'Over current protection' },
    { label: 'Over voltage protection', field: 'Over voltage protection' },
    { label: 'Lightning arrester', field: 'Lightning arrester' },
  ])
  kv('Arrester counter reading:', by['Arrester counter reading'] || '')
  kv('Fault recorder records:', by['Fault recorder records'] || '')

  // 5 Protective devices of the tap changer
  children.push(wNumberedSection('5', 'Protective devices of the tap changer'))
  cb([
    { label: 'DW 2000', field: 'DW 2000' },
    { label: 'Qualitrol', field: 'Qualitrol' },
    { label: 'RS 1000', field: 'RS 1000' },
    { label: 'RS 2001', field: 'RS 2001' },
  ])
  cb([
    { label: 'Flap after incident: ON', field: 'Flap after incident: ON' },
    { label: 'Flap after incident: OFF', field: 'Flap after incident: OFF' },
  ])
  kv('Inclination of pipe (relay to conservator):', by['Inclination of pipe (relay to conservator)'] || '')
  kv('Sketch / photo notes:', by['Sketch / photo notes'] || '')
  cb([
    { label: 'Conservators together', field: 'Conservators together' },
    { label: 'Conservators separate', field: 'Conservators separate' },
  ])
  cb([
    { label: 'Oil contact w/ atmosphere: together', field: 'Oil contact w/ atmosphere: together' },
    { label: 'Oil contact w/ atmosphere: separate', field: 'Oil contact w/ atmosphere: separate' },
  ])
  kv('Silica gel / pressure valve / nitrogen (setting value):', by['Silica gel / pressure valve / nitrogen (setting value)'] || '')
  cb([
    { label: 'Flap valve: Left', field: 'Flap valve: Left' },
    { label: 'Flap valve: Center', field: 'Flap valve: Center' },
  ])
  kv('Dimension of valve opening:', by['Dimension of valve opening'] || '')
  cb([
    { label: 'Tripping: HV circuit break', field: 'Tripping: HV circuit break' },
    { label: 'Tripping: other', field: 'Tripping: other' },
  ])
  cb([{ label: 'Oil filter installed', field: 'Oil filter installed' }])
  kv('Operating pressure on gauge (bar):', by['Operating pressure on gauge (bar)'] || '')

  // 6 Data of network and substation
  children.push(wNumberedSection('6', 'Data of network and substation'))
  cb([
    { label: 'HV side: Cable', field: 'HV side: Cable' },
    { label: 'HV side: Overhead line', field: 'HV side: Overhead line' },
    { label: 'HV side: Other', field: 'HV side: Other' },
  ])
  cb([
    { label: 'LV side: Cable', field: 'LV side: Cable' },
    { label: 'LV side: Overhead line', field: 'LV side: Overhead line' },
    { label: 'LV side: Other', field: 'LV side: Other' },
  ])

  // 7 Additional information
  children.push(wNumberedSection('7', 'Additional information'))
  kv('Irregularities noticed before the incident:', by['Irregularities noticed before the incident'] || '')
  kv('Further circumstances known:', by['Further circumstances known'] || '')
  kv('Steps taken directly after the incident:', by['Steps taken directly after the incident'] || '')
  kv('Dielectric strength (kV/2.5mm):', by['Dielectric strength (kV/2.5mm)'] || '')
  kv('Water content (ppm):', by['Water content (ppm)'] || '')
  kv('Oil temp. during sampling (deg C):', by['Oil temp. during sampling (deg C)'] || '')
  kv('Results of tap changer check:', by['Results of tap changer check'] || '')
  kv('Photograph notes (if damaged):', by['Photograph notes (if damaged)'] || '')

  // Sign-off
  children.push(wSignoffTwoParty(
    { title: 'CUSTOMER', headerFill: COLORS.blue, rows: [['Name:', by['Customer Name'] || params.clientName || '']], sig: params.clientSignature },
    { title: 'EMR', headerFill: COLORS.red, rows: [['Name:', by['Field Engineer Name'] || params.engineerName || '']], sig: params.engineerSignature },
  ))

  const doc = new Document({ sections: [{ children }] })
  return Packer.toBuffer(doc)
}
