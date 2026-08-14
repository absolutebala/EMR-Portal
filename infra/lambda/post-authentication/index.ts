import { Client } from 'pg'
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager'

// Cognito's PostAuthentication trigger — fires after every successful sign-in,
// including a just-migrated user's very first one. profiles.cognito_sub can't be set
// during the UserMigration_Authentication trigger (infra/lambda/user-migration) since
// Cognito hasn't generated the new user's `sub` yet at that point — this is the first
// point in the flow where it exists. Idempotent (only writes when cognito_sub is still
// NULL) so it's a no-op for already-linked users, including anyone Phase F's
// invite-user.ts already set cognito_sub for at creation time.
//
// VPC-attached (unlike user-migration) — this one only needs to reach RDS, which is
// VPC-internal with no public access; it doesn't touch Supabase at all.
interface CognitoTriggerEvent {
  triggerSource: string
  userName: string
  request: { userAttributes: Record<string, string> }
}

let cachedDbUrl: string | undefined

async function getRdsUrl(): Promise<string> {
  if (cachedDbUrl) return cachedDbUrl
  const sm = new SecretsManagerClient({})
  const result = await sm.send(new GetSecretValueCommand({ SecretId: 'emr-portal/PGRST_DB_URI' }))
  if (!result.SecretString) throw new Error('PGRST_DB_URI secret has no value')
  cachedDbUrl = result.SecretString
  return cachedDbUrl
}

export const handler = async (event: CognitoTriggerEvent): Promise<CognitoTriggerEvent> => {
  if (event.triggerSource !== 'PostAuthentication_Authentication') return event

  const sub = event.request.userAttributes.sub
  const email = event.request.userAttributes.email ?? event.userName

  const client = new Client({ connectionString: await getRdsUrl(), connectionTimeoutMillis: 8_000, ssl: { rejectUnauthorized: false } })
  await client.connect()
  try {
    await client.query(
      'update public.profiles set cognito_sub = $1 where email = $2 and cognito_sub is null',
      [sub, email]
    )
  } finally {
    await client.end()
  }

  return event
}
