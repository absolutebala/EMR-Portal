import * as cognito from './cognito';
import { setSession, clearSession, fromAuthResult } from './sessionStore';

export type LoginResult =
  | { status: 'ok' }
  | { status: 'challenge'; session: string; email: string }
  | { status: 'error'; error: string };

export async function login(email: string, password: string): Promise<LoginResult> {
  try {
    const result = await cognito.initiateAuth(email, password);

    // Temp-password (newly invited, or admin-reset) users land here instead of
    // getting tokens directly — see change-password.tsx for the completion step.
    if (result.ChallengeName === 'NEW_PASSWORD_REQUIRED') {
      if (!result.Session) return { status: 'error', error: 'Could not start password setup. Please try again.' };
      return { status: 'challenge', session: result.Session, email };
    }

    if (!result.AuthenticationResult) return { status: 'error', error: 'Sign-in failed. Please try again.' };
    await setSession(fromAuthResult(result.AuthenticationResult));
    return { status: 'ok' };
  } catch (e: unknown) {
    return { status: 'error', error: friendlyError(e) };
  }
}

export async function completeNewPassword(email: string, session: string, newPassword: string): Promise<{ error: string | null }> {
  try {
    const result = await cognito.respondToNewPasswordChallenge(email, session, newPassword);
    if (!result.AuthenticationResult) return { error: 'Could not set your password. Please try again.' };
    await setSession(fromAuthResult(result.AuthenticationResult));
    return { error: null };
  } catch (e: unknown) {
    return { error: friendlyError(e) };
  }
}

export async function logout(): Promise<void> {
  await clearSession();
}

export async function requestPasswordReset(email: string): Promise<{ error: string | null }> {
  try {
    await cognito.forgotPassword(email);
    return { error: null };
  } catch {
    // Don't leak which emails are registered — same as the web app's version.
    return { error: null };
  }
}

export async function confirmPasswordReset(email: string, code: string, newPassword: string): Promise<{ error: string | null }> {
  try {
    await cognito.confirmForgotPassword(email, code, newPassword);
    return { error: null };
  } catch (e: unknown) {
    return { error: friendlyError(e) };
  }
}

function friendlyError(e: unknown): string {
  if (e instanceof cognito.CognitoError) {
    if (e.code === 'NotAuthorizedException' || e.code === 'UserNotFoundException') {
      return 'Incorrect email or password.';
    }
    return e.message;
  }
  return e instanceof Error ? e.message : 'Something went wrong.';
}
