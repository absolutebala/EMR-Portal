import { redirect } from 'next/navigation'
import { headers } from 'next/headers'

// Mobile visitors land on the PWA install prompt instead of the desktop admin
// dashboard — most people opening the bare domain on a phone are field engineers
// who should be nudged to install the app, not bounced into /login for the desktop
// portal. Desktop UAs keep the existing behavior unchanged.
function isMobileUA(ua: string): boolean {
  return /android|iphone|ipad|ipod|mobile/i.test(ua)
}

export default async function Home() {
  const h = await headers()
  const ua = h.get('user-agent') || ''
  if (isMobileUA(ua)) redirect('/mobile/install')
  redirect('/dashboard')
}
