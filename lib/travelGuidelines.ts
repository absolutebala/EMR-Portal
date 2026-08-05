// Boarding & Lodging eligibility limits from "Travel Rules & Guidelines W.E.F.
// 01.06.2024" (Rev.No.11). Only the B&L table is encoded here — Journey Allowance,
// Local Conveyance, Sunday allowance, Tatkal charges etc. are out of scope for now.

export type Grade = 'M0' | 'M1' | 'M2' | 'M3' | 'M4' | 'M5' | 'M6' | 'M7' | 'M8' | 'M9' | 'M10' | 'M11'
  | 'WK GR I' | 'WK GR II' | 'WK GR III' | 'WK GR IV'

export const GRADES: Grade[] = [
  'M11', 'M10', 'M9', 'M8', 'M7', 'M6', 'M5', 'M4', 'M3', 'M2', 'M1', 'M0',
  'WK GR I', 'WK GR II', 'WK GR III', 'WK GR IV',
]

export type CityTier = 'metro' | 'pondicherry' | 'other'
export type ClaimType = 'flat' | 'actual'

export const CITY_TIER_LABEL: Record<CityTier, string> = {
  metro: 'Metro (Delhi/Mumbai/Chennai/Kolkata)',
  pondicherry: 'Pondicherry (Unit II)',
  other: 'All Other Places',
}

// 'actual' means: no fixed cap, reimbursed against bills — never flagged as over limit.
const ACTUAL = 'actual' as const
type TierAmount = number | typeof ACTUAL
interface TierAmounts { metro: TierAmount; pondicherry: TierAmount; other: TierAmount }
interface GradeRow { actual: TierAmounts | null; flat: TierAmounts | null }

// Several grades share one eligibility row in the source table.
type RowKey = 'M11' | 'M10' | 'M9' | 'M8' | 'M7' | 'M6' | 'M5' | 'M4' | 'M3' | 'M2' | 'M0_M1_WK3_WK4' | 'WK1_WK2'

const GRADE_TO_ROW: Record<Grade, RowKey> = {
  M11: 'M11', M10: 'M10', M9: 'M9', M8: 'M8', M7: 'M7', M6: 'M6', M5: 'M5', M4: 'M4', M3: 'M3', M2: 'M2',
  M1: 'M0_M1_WK3_WK4', M0: 'M0_M1_WK3_WK4',
  'WK GR III': 'M0_M1_WK3_WK4', 'WK GR IV': 'M0_M1_WK3_WK4',
  'WK GR I': 'WK1_WK2', 'WK GR II': 'WK1_WK2',
}

const BL_LIMITS: Record<RowKey, GradeRow> = {
  M11: { actual: { metro: ACTUAL, pondicherry: ACTUAL, other: ACTUAL }, flat: null },
  M10: { actual: { metro: ACTUAL, pondicherry: ACTUAL, other: ACTUAL }, flat: null },
  M9: { actual: { metro: 4000, pondicherry: ACTUAL, other: 3500 }, flat: { metro: 2000, pondicherry: ACTUAL, other: 1750 } },
  M8: { actual: { metro: 3500, pondicherry: ACTUAL, other: 2900 }, flat: { metro: 1625, pondicherry: ACTUAL, other: 1350 } },
  M7: { actual: { metro: 3200, pondicherry: ACTUAL, other: 2700 }, flat: { metro: 1500, pondicherry: ACTUAL, other: 1250 } },
  M6: { actual: null, flat: { metro: 2700, pondicherry: 1500, other: 2400 } },
  M5: { actual: null, flat: { metro: 2500, pondicherry: 1100, other: 2000 } },
  M4: { actual: null, flat: { metro: 2000, pondicherry: 1000, other: 1600 } },
  M3: { actual: null, flat: { metro: 1700, pondicherry: 900, other: 1500 } },
  M2: { actual: null, flat: { metro: 1500, pondicherry: 900, other: 1400 } },
  M0_M1_WK3_WK4: { actual: null, flat: { metro: 1500, pondicherry: 900, other: 1400 } },
  WK1_WK2: { actual: null, flat: { metro: 1200, pondicherry: 900, other: 1000 } },
}

const METRO_KEYWORDS = ['delhi', 'mumbai', 'bombay', 'chennai', 'madras', 'kolkata', 'calcutta']
const PONDICHERRY_KEYWORDS = ['pondicherry', 'puducherry']

// Heuristic keyword match against the work order site's geocoded place label —
// not authoritative, so callers should surface the detected tier rather than hide it.
export function classifyCityTier(placeLabel: string | null | undefined): CityTier {
  const text = (placeLabel || '').toLowerCase()
  if (METRO_KEYWORDS.some(k => text.includes(k))) return 'metro'
  if (PONDICHERRY_KEYWORDS.some(k => text.includes(k))) return 'pondicherry'
  return 'other'
}

// Returns null when the policy defines no cap for this combination (e.g. Pondicherry
// for M7+, or grades M6-and-below claiming "actual") — callers should skip flagging.
export function getEligibleLimit(grade: Grade, tier: CityTier, claimType: ClaimType): number | null {
  const row = BL_LIMITS[GRADE_TO_ROW[grade]]
  const amounts = claimType === 'flat' ? row.flat : row.actual
  if (!amounts) return null
  const value = amounts[tier]
  return value === ACTUAL ? null : value
}

// Whether the flat-allowance option is meaningfully available for this grade/tier
// (as opposed to always requiring bills, e.g. Pondicherry for M7+).
export function isFlatAvailable(grade: Grade, tier: CityTier): boolean {
  const row = BL_LIMITS[GRADE_TO_ROW[grade]]
  if (!row.flat) return false
  return row.flat[tier] !== ACTUAL
}
