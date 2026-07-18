// Shared with both mobile check-in reverse-geocoding (mobile-actions.ts) and
// customer-site forward-geocoding (get-work-orders.ts) so the two stay consistent.
export function extractPlaceLabel(addr: Record<string, string>, displayName?: string): string | null {
  // Indian municipal wards get tagged as `suburb` in OSM (e.g. "Ward 157"), which
  // isn't a real place name — prefer an actual neighbourhood/locality name and only
  // fall back to suburb when it doesn't look like a bare ward number.
  const isWardLike = (v: string | undefined) => !!v && /^ward\b/i.test(v.trim())
  const locality = addr.neighbourhood || addr.quarter || (!isWardLike(addr.suburb) ? addr.suburb : undefined) || addr.town || addr.village || addr.city_district
  const city = addr.city || addr.town || addr.state_district
  const state = addr.state
  const parts = [locality, city, state].filter((v, i, arr): v is string => !!v && arr.indexOf(v) === i)
  return parts.length ? parts.join(', ') : (displayName?.split(',').slice(0, 2).join(',').trim() || null)
}
