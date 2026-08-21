'use server'

import { getAuthedUser } from '@/lib/cognito/server'
import { adminClient } from '@/lib/db/admin-client'
import { getEngineerAnalyticsSummaryCore, getEngineerAnalyticsDrilldownCore, type EngineerAnalyticsSummary, type AnalyticsMetric, type AnalyticsDrilldownRow } from '@/lib/mobile/core/analytics'

export async function getMyAnalyticsSummary(month: string): Promise<{ summary: EngineerAnalyticsSummary; error: string | null }> {
  const user = await getAuthedUser()
  if (!user) return { summary: { assigned: 0, resolved: 0, reassigned: 0, expenseTotal: 0, present: 0, leave: 0 }, error: 'Not authenticated' }
  return getEngineerAnalyticsSummaryCore(adminClient(), user.id, month)
}

export async function getMyAnalyticsDrilldown(month: string, metric: AnalyticsMetric): Promise<{ rows: AnalyticsDrilldownRow[]; error: string | null }> {
  const user = await getAuthedUser()
  if (!user) return { rows: [], error: 'Not authenticated' }
  return getEngineerAnalyticsDrilldownCore(adminClient(), user.id, month, metric)
}
