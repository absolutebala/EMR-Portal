// The fixed temporary password every newly created (or password-reset) user gets.
// Cognito forces a change on first login (FORCE_CHANGE_PASSWORD), so a single,
// easy-to-communicate value keeps onboarding simple rather than a random per-user
// string an admin has to copy and relay each time.
//
// Must satisfy the user pool's password policy: min 8 chars, upper + lower + number +
// symbol — 'Welcome2emr@123' covers all four.
export const DEFAULT_TEMP_PASSWORD = 'Welcome2emr@123'
