'use server'

import { getAuthedUser } from '@/lib/cognito/server'
import { adminClient } from '@/lib/db/admin-client'
import { reverseGeocodeCore } from '@/lib/mobile/core/shared'
import { recordLoginEventCore } from '@/lib/mobile/core/loginEvents'

// On-demand reverse-geocode for the dashboard's suspicious-login detail popup. Older
// app builds (before v51) recorded a login's GPS but no place name, so the label is
// resolved here from the coordinates when an admin opens the detail — then persisted
// back onto every matching login_events row so it's only ever geocoded once.
export async function geocodeLoginPlace(lat: number, lng: number): Promise<string | null> {
  const user = await getAuthedUser()
  if (!user) return null

  const { label } = await reverseGeocodeCore(lat, lng)
  if (label) {
    await adminClient()
      .from('login_events')
      .update({ place_name: label })
      .is('place_name', null)
      .eq('latitude', lat)
      .eq('longitude', lng)
  }
  return label
}

// PWA counterpart of the native app's recordLoginEvent — records this browser login's
// device + location so PWA sign-ins feed the same suspicious-login detection as the
// native app (impossible travel / multiple devices). The client captures the device id,
// a device label and GPS; the place name is reverse-geocoded here. Cookie-session
// authed (unlike the native REST route, which is bearer-token authed). Best-effort —
// never blocks or fails the login.
export async function recordWebLoginEvent(input: {
  deviceId: string | null
  deviceName: string | null
  latitude: number | null
  longitude: number | null
}): Promise<void> {
  const user = await getAuthedUser()
  if (!user) return

  let placeName: string | null = null
  if (typeof input.latitude === 'number' && typeof input.longitude === 'number') {
    placeName = (await reverseGeocodeCore(input.latitude, input.longitude)).label
  }

  await recordLoginEventCore(adminClient(), user.id, {
    deviceId: input.deviceId,
    deviceName: input.deviceName,
    latitude: input.latitude,
    longitude: input.longitude,
    placeName,
  })
}
