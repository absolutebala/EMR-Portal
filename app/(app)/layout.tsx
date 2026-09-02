export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { getAuthedUser } from '@/lib/cognito/server'
import Sidebar from '@/components/layout/Sidebar'
import { adminClient } from '@/lib/db/admin-client'

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/users': 'Users',
  '/customers': 'Customers',
  '/settings': 'Settings',
  '/forms': 'Forms',
  '/work-orders': 'Notifications',
  '/engineers': 'Field Engineers',
  '/products': 'Products',
  '/requests': 'Product Requests',
  '/activities': 'Activities',
  '/attendance': 'Attendance',
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getAuthedUser()

  if (!user) redirect('/login')

  const { data: profile } = await adminClient()
    .from('profiles')
    .select('first_name, last_name, role, is_active, must_change_password')
    .eq('id', user.id)
    .single()

  // Cognito has no equivalent to Supabase's auth.signOut() being callable here to
  // revoke the session server-side — this DB check runs on every request regardless,
  // so a deactivated user stays bounced to /login even if their token is technically
  // still valid until it naturally expires.
  if (profile && !profile.is_active) redirect('/login')

  // profiles.must_change_password is the sole source of truth (Cognito has no
  // user_metadata-style claim to cross-check against, unlike Supabase).
  if (profile?.must_change_password) redirect('/set-password')

  const userName = profile ? `${profile.first_name} ${profile.last_name}` : user.email || 'User'
  const userRole = profile?.role || 'User'

  const [{ data: roleData }, { data: moduleRows }] = await Promise.all([
    adminClient().from('roles').select('permissions').eq('name', userRole).maybeSingle(),
    adminClient().from('user_module_access').select('module').eq('user_id', user.id),
  ])

  const permissions = (roleData?.permissions as Record<string, boolean> | null) ?? {}
  const modules = (moduleRows ?? []).map((r: { module: string }) => r.module)

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar userName={userName} userRole={userRole} permissions={permissions} modules={modules} userEmail={user.email || ''} />
      {/* minWidth: 0 lets this flex item shrink to the available width instead of
          growing to fit oversized content (e.g. a wide table) — without it, that
          content pushes the whole page wider than the viewport and the page itself
          scrolls horizontally instead of the offending content scrolling internally. */}
      <div style={{ marginLeft: 'var(--sidebar-w, 230px)', flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: '100vh', transition: 'margin-left .18s ease' }}>
        {children}
      </div>
    </div>
  )
}
