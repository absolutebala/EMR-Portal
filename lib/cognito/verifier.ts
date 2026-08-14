import { CognitoJwtVerifier } from 'aws-jwt-verify'
import { COGNITO_USER_POOL_ID, COGNITO_WEB_CLIENT_ID } from './config'

// Shared with proxy.ts — same verifier instance shape (JWKS cached once per
// container), reused here for the one other place a raw ID token needs decoding
// (immediately after a fresh RespondToAuthChallenge, before proxy.ts ever sees it).
export const idVerifier = CognitoJwtVerifier.create({
  userPoolId: COGNITO_USER_POOL_ID,
  tokenUse: 'id',
  clientId: COGNITO_WEB_CLIENT_ID,
})
