import * as cognito from './cognito';
import { setSession, clearSession, fromAuthResult } from './sessionStore';
import { apiPost } from './api';

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

// Clears profiles.must_change_password server-side, retried a few times. This is a
// REQUIRED second step after completeNewPassword's Cognito challenge succeeds —
// (app)/_layout.tsx's guard reads that flag via GET /auth/me and signs the user back
// out the moment they navigate in while it's still true, so if this silently failed
// the user would loop back to login with no explanation (exactly the bug this
// replaced). Kept separate from completeNewPassword so the caller can retry JUST this
// step: the Cognito temp-password challenge is single-use, so re-running the whole
// thing after a network blip would fail — but the session is already valid here, so
// retrying only the flag-clear is safe.
export async function finishPasswordSetup(): Promise<{ error: string | null }> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await apiPost('/api/mobile/v1/auth/complete-password-change');
      return { error: null };
    } catch {
      if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 800 * (attempt + 1)));
    }
  }
  return { error: 'Your password was updated, but we could not finish setting up your account. Check your internet connection and try again.' };
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
