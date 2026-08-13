// One-off VPC-internal HTTP connectivity checker (Phase D0) — mirrors the
// schema-runner Lambda's role for Postgres: this VPC has no NAT Gateway, so there's no
// way to curl an internal-only service (like PostgREST's Cloud Map DNS name) from
// outside the VPC. Invoked directly via `aws lambda invoke` with {url, method?, body?}.
interface ProbeEvent {
  url: string
  method?: string
  body?: string
}

export const handler = async (event: ProbeEvent) => {
  const res = await fetch(event.url, {
    method: event.method || 'GET',
    body: event.body,
    headers: event.body ? { 'Content-Type': 'application/json' } : undefined,
  })
  const text = await res.text()
  return { status: res.status, body: text.slice(0, 4000) }
}
