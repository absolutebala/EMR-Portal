'use server'

import { getAuthedUser } from '@/lib/cognito/server'
import { adminClient } from '@/lib/db/admin-client'
import { reverseGeocodeCore } from '@/lib/mobile/core/shared'

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
