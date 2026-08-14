import { CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider'
import { COGNITO_REGION } from './config'

// One client, reused across invocations (module-level — Lambda/Fargate-container
// lifetime, same pattern as any other AWS SDK client in this codebase). No explicit
// credentials: picked up from the ECS task role in production, the local AWS CLI
// profile in dev — same as every other AWS SDK call already made throughout this
// migration.
export const cognitoClient = new CognitoIdentityProviderClient({ region: COGNITO_REGION })
