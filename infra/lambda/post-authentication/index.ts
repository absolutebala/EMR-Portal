import { Client } from 'pg'

// Cognito's PostAuthentication trigger — fires after every successful sign-in,
// including a just-migrated user's very first one. profiles.cognito_sub can't be set
// during the UserMigration_Authentication trigger (infra/lambda/user-migration) since
// Cognito hasn't generated the new user's `sub` yet at that point — this is the first
// point in the flow where it exists. Idempotent (only writes when cognito_sub is still
// NULL) so it's a no-op for already-linked users, including anyone Phase F's
// invite-user.ts already set cognito_sub for at creation time.
//
// VPC-attached (unlike user-migration) — this one only needs to reach RDS, which is
// VPC-internal with no public access; it doesn't touch Supabase at all. That VPC
// attachment is also why DB_URI comes in as a plain environment variable (set by
// auth-stack.ts from the PGRST_DB_URI secret, resolved by CloudFormation at deploy
// time) instead of being fetched from Secrets Manager at runtime the way
// user-migration does — this Lambda has no internet route (no NAT Gateway) to reach
// Secrets Manager's API, the same constraint that already forced schema-runner's
// credentials-via-payload design. Cognito controls this Lambda's invocation payload
// directly, so that pattern isn't available here; baking the connection string into
// the environment was a deliberate, explicit tradeoff (see auth-stack.ts).
interface CognitoTriggerEvent {
  triggerSource: string
  userName: string
  request: { userAttributes: Record<string, string> }
}

export const handler = async (event: CognitoTriggerEvent): Promise<CognitoTriggerEvent> => {
  if (event.triggerSource !== 'PostAuthentication_Authentication') return event

  const sub = event.request.userAttributes.sub
  const email = event.request.userAttributes.email ?? event.userName

  const client = new Client({ connectionString: process.env.DB_URI, connectionTimeoutMillis: 8_000, ssl: { rejectUnauthorized: false } })
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
