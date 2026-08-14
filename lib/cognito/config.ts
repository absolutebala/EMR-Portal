// Non-secret Cognito config — safe to read at build or runtime. No NEXT_PUBLIC_ prefix
// needed: login/session logic runs entirely server-side (Server Actions + proxy.ts),
// nothing here ships to the browser bundle.
export const COGNITO_USER_POOL_ID = process.env.COGNITO_USER_POOL_ID!
export const COGNITO_WEB_CLIENT_ID = process.env.COGNITO_WEB_CLIENT_ID!
// Used only to verify bearer access tokens from the React Native app (lib/mobile/apiAuth.ts) —
// the web app itself never authenticates as this client.
export const COGNITO_MOBILE_CLIENT_ID = process.env.COGNITO_MOBILE_CLIENT_ID!
export const COGNITO_REGION = process.env.AWS_REGION || 'ap-south-2'
