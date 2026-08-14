// Direct Cognito wire protocol (X-Amz-Target JSON POSTs) — the same protocol the AWS
// SDK uses under the hood for these specific actions, none of which require SigV4
// signing (they're the app-client-facing "unauthenticated API" surface: InitiateAuth,
// RespondToAuthChallenge, ForgotPassword, ConfirmForgotPassword). Calling it directly
// avoids bundling @aws-sdk/client-cognito-identity-provider (and its Node-oriented
// dependencies) into the RN app just for four endpoints.
const COGNITO_REGION = process.env.EXPO_PUBLIC_COGNITO_REGION!;
const COGNITO_CLIENT_ID = process.env.EXPO_PUBLIC_COGNITO_CLIENT_ID!;
const COGNITO_ENDPOINT = `https://cognito-idp.${COGNITO_REGION}.amazonaws.com/`;

export class CognitoError extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.code = code;
  }
}

async function cognitoRequest<T>(target: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(COGNITO_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-amz-json-1.1',
      'X-Amz-Target': `AWSCognitoIdentityProviderService.${target}`,
    },
    body: JSON.stringify({ ClientId: COGNITO_CLIENT_ID, ...body }),
  });
  const data = await res.json();
  if (!res.ok) {
    // Cognito's error shape: { __type: "NotAuthorizedException", message: "..." }
    throw new CognitoError(data.message || data.__type || 'Request failed', data.__type || 'UnknownError');
  }
  return data as T;
}

export interface AuthenticationResult {
  IdToken: string;
  AccessToken: string;
  // Omitted by Cognito on a REFRESH_TOKEN_AUTH response — the original refresh token
  // stays valid, so callers on that path supply their existing one to fromAuthResult.
  RefreshToken?: string;
}

interface InitiateAuthResponse {
  ChallengeName?: string;
  Session?: string;
  AuthenticationResult?: AuthenticationResult;
}

export function initiateAuth(email: string, password: string): Promise<InitiateAuthResponse> {
  return cognitoRequest('InitiateAuth', {
    AuthFlow: 'USER_PASSWORD_AUTH',
    AuthParameters: { USERNAME: email, PASSWORD: password },
  });
}

export function refreshAuth(refreshToken: string): Promise<InitiateAuthResponse> {
  return cognitoRequest('InitiateAuth', {
    AuthFlow: 'REFRESH_TOKEN_AUTH',
    AuthParameters: { REFRESH_TOKEN: refreshToken },
  });
}

export function respondToNewPasswordChallenge(email: string, session: string, newPassword: string): Promise<InitiateAuthResponse> {
  return cognitoRequest('RespondToAuthChallenge', {
    ChallengeName: 'NEW_PASSWORD_REQUIRED',
    Session: session,
    ChallengeResponses: { USERNAME: email, NEW_PASSWORD: newPassword },
  });
}

export function forgotPassword(email: string): Promise<void> {
  return cognitoRequest('ForgotPassword', { Username: email });
}

export function confirmForgotPassword(email: string, code: string, newPassword: string): Promise<void> {
  return cognitoRequest('ConfirmForgotPassword', { Username: email, ConfirmationCode: code, Password: newPassword });
}
