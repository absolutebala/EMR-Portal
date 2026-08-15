// Raw transport for Combirds' WhatsApp Campaign API. No business logic, no settings
// lookup — lib/messaging/whatsapp.ts owns that. Never throws: a notification failure
// must never break the business action that triggered it (mirrors lib/notifications.ts).
const COMBIRDS_ENDPOINT = 'https://backend.api-wa.co/campaign/combirds/api/v2'

export interface CombirdsSendParams {
  apiKey: string
  campaignName: string
  destination: string
  userName: string
  templateParams?: string[]
  source?: string
}

export async function sendCombirdsMessage(params: CombirdsSendParams): Promise<boolean> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8000)
  try {
    const res = await fetch(COMBIRDS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        apiKey: params.apiKey,
        campaignName: params.campaignName,
        destination: params.destination,
        userName: params.userName,
        ...(params.templateParams ? { templateParams: params.templateParams } : {}),
        ...(params.source ? { source: params.source } : {}),
      }),
    })
    if (!res.ok) {
      console.error('sendCombirdsMessage: non-200 response', res.status, await res.text().catch(() => ''))
      return false
    }
    console.log('sendCombirdsMessage: sent', { campaignName: params.campaignName, destination: params.destination })
    return true
  } catch (e) {
    console.error('sendCombirdsMessage: failed', e instanceof Error ? e.message : e)
    return false
  } finally {
    clearTimeout(timeout)
  }
}
