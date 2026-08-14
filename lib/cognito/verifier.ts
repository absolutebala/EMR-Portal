import { CognitoJwtVerifier } from 'aws-jwt-verify'
import { COGNITO_USER_POOL_ID, COGNITO_WEB_CLIENT_ID } from './config'

// Lazy on purpose — Next.js's build step ("collecting page data") statically imports
// and evaluates every route module, including this one transitively, inside the
// Docker build where COGNITO_USER_POOL_ID/COGNITO_WEB_CLIENT_ID aren't set (they're
// runtime-only ECS env vars, not Docker build args — nothing in the client bundle
// needs them, so there was never a reason to add them as build args). Constructing
// the verifier eagerly at module scope crashed the build with "Cannot read properties
// of undefined (reading 'match')" from CognitoJwtVerifier.create() parsing an
// undefined pool id. Deferring construction to first real call (which only happens at
// container runtime, when these vars are actually set) sidesteps that entirely.
let cached: ReturnType<typeof CognitoJwtVerifier.create> | undefined

export function getIdVerifier() {
  if (!cached) {
    cached = CognitoJwtVerifier.create({
      userPoolId: COGNITO_USER_POOL_ID,
      tokenUse: 'id',
      clientId: COGNITO_WEB_CLIENT_ID,
    })
  }
  return cached
}
