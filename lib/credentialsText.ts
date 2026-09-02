// Shared builder for the "share these login details" text copied to the clipboard
// when an admin invites / resets a user. Field Engineers use the Android app (they
// never touch the web portal), so they get the Play Store link instead of the portal
// URL. NEXT_PUBLIC_SITE_URL is inlined at build time and safe to read in client code.

const PORTAL_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://portal.emr.global'
export const FIELD_APP_URL = 'https://play.google.com/store/apps/details?id=com.emrglobal.emrfieldapp'

export function isFieldEngineer(role?: string | null): boolean {
  return role === 'Field Engineer'
}

// The URL an admin should hand this user to log in — app store for field engineers,
// web portal for everyone else.
export function loginUrlForRole(role?: string | null): string {
  return isFieldEngineer(role) ? FIELD_APP_URL : PORTAL_URL
}

export function buildCredentialsText(email: string, tempPassword: string, role?: string | null): string {
  if (isFieldEngineer(role)) {
    return `EMR Field App Login Details\n\nAndroid app: ${FIELD_APP_URL}\nEmail: ${email}\nTemporary Password: ${tempPassword}\n\nInstall the app, sign in, and set your own password when prompted.`
  }
  return `EMR Portal Login Details\n\nURL: ${PORTAL_URL}\nEmail: ${email}\nTemporary Password: ${tempPassword}\n\nPlease log in and set your own password when prompted.`
}
