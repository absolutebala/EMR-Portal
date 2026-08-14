import { Client } from 'pg'
import bcrypt from 'bcryptjs'
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager'

// Cognito's UserMigration_Authentication trigger — fires when a user who doesn't
// exist in the User Pool yet attempts a normal password sign-in (see
// app/actions/login.ts's InitiateAuthCommand). Deliberately NOT VPC-attached (this
// repo's VPC has no NAT Gateway, so a VPC-attached Lambda has no internet route) —
// this Lambda needs internet access to reach Supabase's public Postgres endpoint,
// which it can only verify a password against, not RDS (VPC-internal, unreachable
// from here). Time-boxed to the ~30-day post-cutover window while Supabase stays up;
// after that, any not-yet-logged-in user gets a manual admin-triggered reset instead
// (see app/actions/reset-user-password.ts) — fine at ~100 known users.
interface CognitoTriggerEvent {
  triggerSource: string
  userName: string
  request: { password: string }
  response: {
    userAttributes?: Record<string, string>
    finalUserStatus?: string
    messageAction?: string
  }
}

let cachedDbUrl: string | undefined

async function getSupabaseDbUrl(): Promise<string> {
  if (cachedDbUrl) return cachedDbUrl
  const sm = new SecretsManagerClient({})
  const result = await sm.send(new GetSecretValueCommand({ SecretId: 'emr-portal/SUPABASE_DB_URL' }))
  if (!result.SecretString) throw new Error('SUPABASE_DB_URL secret has no value')
  cachedDbUrl = result.SecretString
  return cachedDbUrl
}

export const handler = async (event: CognitoTriggerEvent): Promise<CognitoTriggerEvent> => {
  if (event.triggerSource !== 'UserMigration_Authentication') return event

  const email = event.userName
  const password = event.request.password

  const client = new Client({ connectionString: await getSupabaseDbUrl(), connectionTimeoutMillis: 8_000 })
  await client.connect()
  try {
    const result = await client.query(
      'select encrypted_password from auth.users where email = $1 and encrypted_password is not null limit 1',
      [email]
    )
    const encryptedPassword = result.rows[0]?.encrypted_password as string | undefined
    if (!encryptedPassword) throw new Error('User migration failed.')

    const matches = bcrypt.compareSync(password, encryptedPassword)
    if (!matches) throw new Error('User migration failed.')

    event.response.userAttributes = {
      email,
      email_verified: 'true',
    }
    event.response.finalUserStatus = 'CONFIRMED'
    event.response.messageAction = 'SUPPRESS'
    return event
  } finally {
    await client.end()
  }
}
