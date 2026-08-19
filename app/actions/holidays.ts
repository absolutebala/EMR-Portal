'use server'

import { getAuthedUser } from '@/lib/cognito/server'
import { adminClient } from '@/lib/mobile/core/shared'

export interface Holiday {
  id: string
  date: string
  name: string
}

export async function getHolidays(): Promise<{ holidays: Holiday[]; error: string | null }> {
  try {
    const { data, error } = await adminClient().from('holidays').select('id, holiday_date, name').order('holiday_date', { ascending: true })
    if (error) return { holidays: [], error: error.message }
    return { holidays: (data || []).map(h => ({ id: h.id, date: h.holiday_date, name: h.name })), error: null }
  } catch (e: unknown) {
    return { holidays: [], error: e instanceof Error ? e.message : String(e) }
  }
}

export async function addHoliday(date: string, name: string): Promise<{ error: string | null }> {
  const user = await getAuthedUser()
  if (!user) return { error: 'Not authenticated' }
  if (!date || !name.trim()) return { error: 'Date and name are required' }
  try {
    const { error } = await adminClient().from('holidays').insert({ holiday_date: date, name: name.trim() })
    if (error) return { error: error.message }
    return { error: null }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

export async function deleteHoliday(id: string): Promise<{ error: string | null }> {
  const user = await getAuthedUser()
  if (!user) return { error: 'Not authenticated' }
  try {
    const { error } = await adminClient().from('holidays').delete().eq('id', id)
    if (error) return { error: error.message }
    return { error: null }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}
