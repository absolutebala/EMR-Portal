import { Client } from 'pg'

// One-off migration runner (Supabase migration Phase B) — RDS is VPC-private with no
// public access (no NAT Gateway in this VPC, deliberate cost trade-off), so this Lambda
// (attached to the same security group the ECS task uses, already allowed through the
// DB's security group) is the only way to run SQL against it from outside the VPC.
// Invoked directly via `aws lambda invoke` with a JSON payload of {name, sql} files —
// no S3/asset bundling needed for ~73KB of migration SQL.
//
// DB credentials come in the invocation payload rather than being fetched from Secrets
// Manager by the Lambda itself: this Lambda has no internet route (no NAT Gateway, and
// it must be VPC-attached to reach RDS), so it can't reach Secrets Manager's public API
// endpoint either. The invoker (outside the VPC) fetches the secret and passes it in.

interface FileInput {
  name: string
  sql: string
}

interface DbCreds {
  host: string
  port: number
  dbname: string
  username: string
  password: string
}

interface RunEvent {
  files: FileInput[]
  db: DbCreds
}

export const handler = async (event: RunEvent) => {
  const client = new Client({
    host: event.db.host,
    port: event.db.port,
    database: event.db.dbname,
    user: event.db.username,
    password: event.db.password,
    connectionTimeoutMillis: 10_000,
    // RDS's default parameter group rejects plaintext connections (confirmed via a
    // real "no pg_hba.conf entry ... no encryption" error) — rejectUnauthorized:false
    // is a pragmatic simplification for this private, VPC-internal-only instance
    // rather than pinning RDS's CA bundle.
    ssl: { rejectUnauthorized: false },
  })

  const results: { file: string; status: 'ok' | 'error'; error?: string; rows?: unknown[] }[] = []
  await client.connect()
  try {
    for (const file of event.files) {
      try {
        const result = await client.query(file.sql)
        // rows is populated for SELECTs (used by verification queries), omitted
        // (empty) for DDL/DML — keeps migration-replay output compact.
        results.push({ file: file.name, status: 'ok', ...(result.rows.length ? { rows: result.rows } : {}) })
      } catch (e) {
        results.push({ file: file.name, status: 'error', error: e instanceof Error ? e.message : String(e) })
        break // stop on first failure — later migrations likely depend on earlier ones
      }
    }
  } finally {
    await client.end()
  }
  return results
}
