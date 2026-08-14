// Non-secret Cognito config — safe to read at build or runtime. No NEXT_PUBLIC_ prefix
// needed: login/session logic runs entirely server-side (Server Actions + proxy.ts),
// nothing here ships to the browser bundle.
export const COGNITO_USER_POOL_ID = process.env.COGNITO_USER_POOL_ID!
export const COGNITO_WEB_CLIENT_ID = process.env.COGNITO_WEB_CLIENT_ID!
export const COGNITO_REGION = process.env.AWS_REGION || 'ap-south-2'
