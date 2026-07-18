// Shared with both mobile check-in reverse-geocoding (mobile-actions.ts) and
// customer-site forward-geocoding (get-work-orders.ts) so the two stay consistent.

// Indian OSM data tags administrative subdivisions (municipal wards, corporation
// zones, water-board divisions, etc.) as ordinary address fields — e.g.
// neighbourhood: "CMWSSB Division 157", suburb: "Ward 157", city_district:
// "Zone 12 Alandur" — none of which are place names a person would recognize.
// The real locality name (e.g. "Manapakkam") is often present in the SAME
// response under a different field, so skip anything matching this pattern
// rather than accepting the first non-empty field.
function isAdminLabel(v: string | undefined): boolean {
  return !!v && /\b(ward|zone|division)\s*\d/i.test(v.trim())
}

function pick(...candidates: (string | undefined)[]): string | undefined {
  return candidates.find(v => v && !isAdminLabel(v))
}

export function extractPlaceLabel(addr: Record<string, string>, displayName?: string): string | null {
  const locality = pick(addr.neighbourhood, addr.quarter, addr.suburb, addr.town, addr.village, addr.city_district)
  const city = addr.city || addr.town || addr.state_district
  const state = addr.state
  const parts = [locality, city, state].filter((v, i, arr): v is string => !!v && arr.indexOf(v) === i)
  return parts.length ? parts.join(', ') : (displayName?.split(',').slice(0, 2).join(',').trim() || null)
}
