import type { PunchCategory } from './types';

export interface CategoryMeta {
  id: PunchCategory;
  label: string;
  desc: string;
  bg: string;   // day / cell background tint
  ac: string;   // accent (badge)
  tx: string;   // text on the tint
  tag: string;  // short badge, e.g. T(R)
  needsDetails: boolean;
}

// Work categories chosen at punch-in. HQ needs no visit details; the other four collect
// customer / site / purpose. Colours drive the day tint in the attendance views.
export const PUNCH_CATEGORIES: CategoryMeta[] = [
  { id: 'travel_r',  label: 'Travel (R)',  desc: 'Travelling — recoverable',     bg: '#FCE7F0', ac: '#DB2777', tx: '#9D174D', tag: 'T(R)',  needsDetails: true },
  { id: 'travel_nr', label: 'Travel (NR)', desc: 'Travelling — non-recoverable', bg: '#FEF6C7', ac: '#CA8A04', tx: '#854D0E', tag: 'T(NR)', needsDetails: true },
  { id: 'site_r',    label: 'Site (R)',    desc: 'At site — recoverable',        bg: '#DCFCE7', ac: '#16A34A', tx: '#166534', tag: 'S(R)',  needsDetails: true },
  { id: 'site_nr',   label: 'Site (NR)',   desc: 'At site — non-recoverable',    bg: '#DBEAFE', ac: '#2563EB', tx: '#1E40AF', tag: 'S(NR)', needsDetails: true },
  { id: 'hq',        label: 'HQ',          desc: 'At head office',               bg: '#EEF0F2', ac: '#6B7280', tx: '#374151', tag: 'HQ',    needsDetails: false },
];

export function categoryMeta(c: PunchCategory | null | undefined): CategoryMeta | null {
  return c ? (PUNCH_CATEGORIES.find(x => x.id === c) ?? null) : null;
}
