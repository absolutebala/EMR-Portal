// Punch-in work categories v2 (shared by the PWA punch-in flow and the desktop
// attendance grid). Top level: HQ, Business Development, Travel, Site Visit, Others.
// HQ needs no visit details; everything else collects customer / site / purpose. Travel
// and Site Visit each pick one of four sub-types, encoded into the combined key. Colours
// (lighter variants of the reference chart) drive the day/cell tint. Legacy v1 keys
// (travel_r/nr, site_r/nr) are kept so historical rows still render.
export type PunchCategory =
  | 'hq' | 'business_dev' | 'others'
  | 'travel_recoverable' | 'travel_non_recoverable' | 'travel_nfpfs_installation' | 'travel_nfpfs_commissioning'
  | 'site_recoverable' | 'site_non_recoverable' | 'site_nfpfs_installation' | 'site_nfpfs_commissioning'
  | 'travel_r' | 'travel_nr' | 'site_r' | 'site_nr'

export interface CategoryMeta {
  id: PunchCategory
  label: string
  bg: string
  ac: string
  tx: string
  tag: string
  needsDetails: boolean
}

// key -> colour + label. bg is the light cell tint, ac the accent (badge / border), tx
// the dark text. Chart number in the comment.
export const PUNCH_CATEGORIES: CategoryMeta[] = [
  { id: 'hq',                          label: 'HQ',                             bg: '#FBEDE2', ac: '#E0A97E', tx: '#9A5B2E', tag: 'HQ',       needsDetails: false }, // 1 peach
  { id: 'business_dev',                label: 'Business Development',           bg: '#E1E6F5', ac: '#3A4FA0', tx: '#1E2A6B', tag: 'BizDev',   needsDetails: true },  // 3 navy
  { id: 'others',                      label: 'Others',                         bg: '#F6F6F7', ac: '#C2C8CF', tx: '#4B5563', tag: 'Other',    needsDetails: true },  // 13 white
  { id: 'travel_recoverable',          label: 'Travel — Recoverable',           bg: '#FBE3F1', ac: '#DB2FA8', tx: '#9D174D', tag: 'Trv·Rec',  needsDetails: true },  // 5 magenta
  { id: 'travel_non_recoverable',      label: 'Travel — Non-Recoverable',       bg: '#FEF9CC', ac: '#CA9A04', tx: '#866A00', tag: 'Trv·NR',   needsDetails: true },  // 9 yellow
  { id: 'travel_nfpfs_installation',   label: 'Travel — NFPFS Installation',    bg: '#F0E2DB', ac: '#B6634A', tx: '#7A3B28', tag: 'Trv·Inst', needsDetails: true },  // 12 brown
  { id: 'travel_nfpfs_commissioning',  label: 'Travel — NFPFS Commissioning',   bg: '#EBE2F6', ac: '#6A2C91', tx: '#4C1D82', tag: 'Trv·Com',  needsDetails: true },  // 7 purple
  { id: 'site_recoverable',            label: 'Site Visit — Recoverable',       bg: '#DFF3E2', ac: '#4CA557', tx: '#1E6B34', tag: 'Site·Rec', needsDetails: true },  // 6 green
  { id: 'site_non_recoverable',        label: 'Site Visit — Non-Recoverable',   bg: '#DCEEFB', ac: '#56ACE4', tx: '#1E5A8A', tag: 'Site·NR',  needsDetails: true },  // 10 sky
  { id: 'site_nfpfs_installation',     label: 'Site Visit — NFPFS Installation',bg: '#FCEFD6', ac: '#F0AD3C', tx: '#8A5A00', tag: 'Site·Inst',needsDetails: true },  // 11 amber
  { id: 'site_nfpfs_commissioning',    label: 'Site Visit — NFPFS Commissioning',bg: '#EDF6D9', ac: '#8FBF3F', tx: '#4D6B10', tag: 'Site·Com', needsDetails: true }, // 8 lime
  // legacy v1 (historical rows only) — keep their original colours
  { id: 'travel_r',  label: 'Travel (R)',  bg: '#FCE7F0', ac: '#DB2777', tx: '#9D174D', tag: 'T(R)',  needsDetails: true },
  { id: 'travel_nr', label: 'Travel (NR)', bg: '#FEF6C7', ac: '#CA8A04', tx: '#854D0E', tag: 'T(NR)', needsDetails: true },
  { id: 'site_r',    label: 'Site (R)',    bg: '#DCFCE7', ac: '#16A34A', tx: '#166534', tag: 'S(R)',  needsDetails: true },
  { id: 'site_nr',   label: 'Site (NR)',   bg: '#DBEAFE', ac: '#2563EB', tx: '#1E40AF', tag: 'S(NR)', needsDetails: true },
]

export function categoryMeta(c: PunchCategory | null | undefined): CategoryMeta | null {
  return c ? (PUNCH_CATEGORIES.find(x => x.id === c) ?? null) : null
}

// --- Picker hierarchy ---------------------------------------------------------------
export type TopCategory = 'hq' | 'business_dev' | 'travel' | 'site_visit' | 'others'
export type SubCategory = 'recoverable' | 'non_recoverable' | 'nfpfs_installation' | 'nfpfs_commissioning'

export interface TopOption {
  id: TopCategory
  label: string
  desc: string
  needsSub: boolean
  needsDetails: boolean
  // The final PunchCategory when this option has no sub-type (HQ / Business Dev / Others).
  directCategory?: PunchCategory
}

export const TOP_OPTIONS: TopOption[] = [
  { id: 'hq',           label: 'HQ',                   desc: 'At head office',           needsSub: false, needsDetails: false, directCategory: 'hq' },
  { id: 'business_dev', label: 'Business Development', desc: 'Business development work', needsSub: false, needsDetails: true,  directCategory: 'business_dev' },
  { id: 'travel',       label: 'Travel',               desc: 'Travelling for work',      needsSub: true,  needsDetails: true },
  { id: 'site_visit',   label: 'Site Visit',           desc: 'Working at a site',        needsSub: true,  needsDetails: true },
  { id: 'others',       label: 'Others',               desc: 'Something else',           needsSub: false, needsDetails: true,  directCategory: 'others' },
]

export const SUB_OPTIONS: { id: SubCategory; label: string }[] = [
  { id: 'recoverable',        label: 'Recoverable' },
  { id: 'non_recoverable',    label: 'Non-Recoverable' },
  { id: 'nfpfs_installation', label: 'NFPFS Installation' },
  { id: 'nfpfs_commissioning',label: 'NFPFS Commissioning' },
]

// Travel/Site Visit + sub-type -> the stored combined key.
export function combineCategory(top: TopCategory, sub: SubCategory): PunchCategory {
  const prefix = top === 'travel' ? 'travel' : 'site'
  return `${prefix}_${sub}` as PunchCategory
}
