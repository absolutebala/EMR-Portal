import { type AdminClient, haversineKm } from './shared'

// Suspicious-login detection thresholds.
const LOOKBACK_DAYS = 7            // how far back the dashboard scans
const IMPOSSIBLE_MIN_KM = 50      // two consecutive logins this far apart …
const IMPOSSIBLE_MAX_GAP_MIN = 60 // … within this many minutes = impossible travel
const MULTI_DEVICE_WINDOW_H = 24  // ≥2 distinct devices logging in within this window = concurrent-device

export interface LoginEventInput {
  deviceId: string | null
  deviceName: string | null
  latitude: number | null
  longitude: number | null
  placeName: string | null
}

// Records one mobile login. Best-effort: a failure here must never block the login
// itself (the caller ignores the result), so it just returns an error string.
export async function recordLoginEventCore(admin: AdminClient, userId: string, input: LoginEventInput): Promise<{ error: string | null }> {
  try {
    const { error } = await admin.from('login_events').insert({
      user_id: userId,
      device_id: input.deviceId,
      device_name: input.deviceName,
      latitude: input.latitude,
      longitude: input.longitude,
      place_name: input.placeName,
    })
    return { error: error?.message || null }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

// One physical device an engineer has logged in from, summarised for the dashboard's
// click-through detail: its name, where it last logged in from (place name + coords),
// when, and how many logins it accounts for in the lookback window.
export interface LoginDeviceSummary {
  deviceId: string | null
  deviceName: string | null
  lastPlaceName: string | null
  lastLatitude: number | null
  lastLongitude: number | null
  lastSeen: string // ISO timestamp of this device's most recent login
  loginCount: number
}

// The device "handover": where/when the account was last used on the previous device vs
// the first login on the now-active device after it switched. The distance between those
// two points over the elapsed time is the clearest account-sharing signal.
export interface LoginHandover {
  prevDeviceId: string | null
  activeDeviceId: string | null
  // Previous device's last activity before the switch.
  prevLastSeen: string
  prevPlaceName: string | null
  prevLatitude: number | null
  prevLongitude: number | null
  // Active device's first login AFTER the previous device's last-seen.
  newFirstLogin: string
  newPlaceName: string | null
  newLatitude: number | null
  newLongitude: number | null
  // Straight-line km between the two points (null if either has no GPS).
  distanceKm: number | null
}

export interface SuspiciousLoginFlag {
  engineerId: string
  engineerName: string
  // 'impossible_travel' — a login far from the previous one in a short time; or
  // 'multi_device' — logins from 2+ distinct devices within the window.
  kinds: ('impossible_travel' | 'multi_device')[]
  detail: string
  at: string // ISO timestamp of the most recent triggering login
  // Every distinct device this engineer logged in from over the lookback window,
  // most-recently-seen first — powers the click-through detail popup.
  devices: LoginDeviceSummary[]
  // The switch from the previous device to the current one (null if only one device).
  handover: LoginHandover | null
}

interface Ev { user_id: string; device_id: string | null; device_name: string | null; latitude: number | null; longitude: number | null; place_name: string | null; created_at: string }

// Scans recent login_events and returns one flag per engineer with any suspicious
// activity. Restricted to the given role set (Field Engineer / Installation Team) via
// the names map the caller passes in.
export async function getSuspiciousLoginsCore(admin: AdminClient, nameById: Record<string, string>): Promise<{ flags: SuspiciousLoginFlag[]; error: string | null }> {
  try {
    const ids = Object.keys(nameById)
    if (!ids.length) return { flags: [], error: null }

    const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString()
    const { data, error } = await admin
      .from('login_events')
      .select('user_id, device_id, device_name, latitude, longitude, place_name, created_at')
      .in('user_id', ids)
      .gte('created_at', since)
      .order('created_at', { ascending: true })
    if (error) return { flags: [], error: error.message }

    const byUser = new Map<string, Ev[]>()
    for (const e of (data as Ev[] | null) || []) {
      const arr = byUser.get(e.user_id) || []
      arr.push(e)
      byUser.set(e.user_id, arr)
    }

    const flags: SuspiciousLoginFlag[] = []
    for (const [uid, events] of byUser) {
      const kinds = new Set<'impossible_travel' | 'multi_device'>()
      let detail = ''
      let at = events[events.length - 1].created_at

      // Group by physical device, keyed by device NAME — not device_id, which is minted
      // fresh on every reinstall, so one phone (e.g. an emulator) otherwise shows up as
      // several "devices". Fall back to device_id (then 'unknown') when no name was
      // captured (older app builds).
      const keyOf = (e: Ev) => e.device_name || e.device_id || 'unknown'

      // Impossible travel: any two consecutive logins with GPS on both, ≥50km apart,
      // within an hour of each other.
      for (let i = 1; i < events.length; i++) {
        const a = events[i - 1], b = events[i]
        if (a.latitude == null || a.longitude == null || b.latitude == null || b.longitude == null) continue
        const gapMin = (new Date(b.created_at).getTime() - new Date(a.created_at).getTime()) / 60000
        if (gapMin > IMPOSSIBLE_MAX_GAP_MIN) continue
        const km = haversineKm(a.latitude, a.longitude, b.latitude, b.longitude)
        if (km >= IMPOSSIBLE_MIN_KM) {
          kinds.add('impossible_travel')
          detail = `${Math.round(km)} km jump in ${Math.round(gapMin)} min${a.place_name && b.place_name ? ` (${a.place_name} → ${b.place_name})` : ''}`
          at = b.created_at
        }
      }

      // Multi-device: 2+ distinct physical devices logging in within a rolling 24h window.
      const windowMs = MULTI_DEVICE_WINDOW_H * 60 * 60 * 1000
      for (let i = 0; i < events.length; i++) {
        const devs = new Set<string>()
        for (let j = i; j < events.length; j++) {
          if (new Date(events[j].created_at).getTime() - new Date(events[i].created_at).getTime() > windowMs) break
          const k = events[j].device_name || events[j].device_id
          if (k) devs.add(k)
        }
        if (devs.size >= 2) {
          kinds.add('multi_device')
          if (!detail) detail = `Logged in from ${devs.size} devices`
          break
        }
      }

      if (kinds.size > 0) {
        // Summarise the distinct devices this engineer logged in from. Events are already
        // in ascending time order, so the last one seen per device is its most recent.
        const deviceMap = new Map<string, LoginDeviceSummary>()
        for (const e of events) {
          const key = keyOf(e)
          const existing = deviceMap.get(key)
          if (!existing) {
            deviceMap.set(key, {
              deviceId: e.device_id,
              deviceName: e.device_name,
              lastPlaceName: e.place_name,
              lastLatitude: e.latitude,
              lastLongitude: e.longitude,
              lastSeen: e.created_at,
              loginCount: 1,
            })
          } else {
            existing.loginCount++
            // Later event = more recent; refresh the "last seen" snapshot.
            existing.lastSeen = e.created_at
            existing.lastPlaceName = e.place_name
            existing.lastLatitude = e.latitude
            existing.lastLongitude = e.longitude
            if (e.device_name) existing.deviceName = e.device_name
          }
        }
        const entries = [...deviceMap.entries()].sort((a, b) => new Date(b[1].lastSeen).getTime() - new Date(a[1].lastSeen).getTime())
        const devices = entries.map(e => e[1])

        // Handover: active device (most recent) vs the device it displaced (next most
        // recent) — now distinct physical devices thanks to name grouping. The active
        // device's "first login after the switch" is its earliest login later than the
        // previous device's last-seen (fallback: its first login).
        let handover: LoginHandover | null = null
        if (entries.length >= 2) {
          const activeKey = entries[0][0]
          const active = entries[0][1], prev = entries[1][1]
          const prevLastMs = new Date(prev.lastSeen).getTime()
          const activeEvents = events.filter(e => keyOf(e) === activeKey)
            .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
          const nf = activeEvents.find(e => new Date(e.created_at).getTime() > prevLastMs) || activeEvents[0]
          if (nf) {
            const distanceKm = (prev.lastLatitude != null && prev.lastLongitude != null && nf.latitude != null && nf.longitude != null)
              ? haversineKm(prev.lastLatitude, prev.lastLongitude, nf.latitude, nf.longitude) : null
            handover = {
              prevDeviceId: prev.deviceId, activeDeviceId: active.deviceId,
              prevLastSeen: prev.lastSeen, prevPlaceName: prev.lastPlaceName, prevLatitude: prev.lastLatitude, prevLongitude: prev.lastLongitude,
              newFirstLogin: nf.created_at, newPlaceName: nf.place_name, newLatitude: nf.latitude, newLongitude: nf.longitude,
              distanceKm,
            }
          }
        }

        flags.push({ engineerId: uid, engineerName: nameById[uid] || 'Engineer', kinds: [...kinds], detail, at, devices, handover })
      }
    }

    // Most recent first.
    flags.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    return { flags, error: null }
  } catch (e: unknown) {
    return { flags: [], error: e instanceof Error ? e.message : String(e) }
  }
}
