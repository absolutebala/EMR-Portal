import { type AdminClient, haversineKm } from './shared'
import { recordLastSeenCore } from './dashboard'

export interface NearbyEngineer {
  id: string
  name: string
  avatarUrl: string | null
  distanceKm: number
  lastSeenAt: string
}

// Server-side cap on how far out this ever returns — the mobile app's own radius
// control (default 10km, user-adjustable) then filters this client-side, so changing
// the radius is instant and doesn't re-trigger a location ping each time.
const MAX_NEARBY_RADIUS_KM = 50
// An engineer only shows up here if THEY have opened the app recently enough for their
// own ping to still be fresh — deliberately no background tracking, see
// recordLastSeenCore's callers.
const STALE_HOURS = 4

export async function getNearbyEngineersCore(admin: AdminClient, userId: string, lat: number, lng: number): Promise<{ engineers: NearbyEngineer[]; error: string | null }> {
  try {
    // Recording this engineer's own ping is a side effect of viewing the strip, not a
    // background timer — fire-and-forget so a slow/failed geocode never blocks the
    // read below.
    recordLastSeenCore(admin, userId, lat, lng).catch(() => {})

    const staleCutoff = new Date(Date.now() - STALE_HOURS * 3600000).toISOString()
    const { data, error } = await admin.from('profiles')
      .select('id, first_name, last_name, avatar_url, last_seen_lat, last_seen_lng, last_seen_at')
      .eq('role', 'Field Engineer')
      .neq('id', userId)
      .not('last_seen_lat', 'is', null)
      .not('last_seen_lng', 'is', null)
      .gte('last_seen_at', staleCutoff)
    if (error) return { engineers: [], error: error.message }

    const engineers: NearbyEngineer[] = (data || [])
      .map(p => ({
        id: p.id,
        name: `${p.first_name} ${p.last_name}`,
        avatarUrl: p.avatar_url,
        distanceKm: haversineKm(lat, lng, p.last_seen_lat as number, p.last_seen_lng as number),
        lastSeenAt: p.last_seen_at as string,
      }))
      .filter(e => e.distanceKm <= MAX_NEARBY_RADIUS_KM)
      .sort((a, b) => a.distanceKm - b.distanceKm)

    return { engineers, error: null }
  } catch (e: unknown) {
    return { engineers: [], error: e instanceof Error ? e.message : String(e) }
  }
}
