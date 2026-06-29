export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Sidebar from '@/components/layout/Sidebar'

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/users': 'Users',
  '/customers': 'Customers',
  '/settings': 'Settings',
  '/forms': 'Forms',
  '/work-orders': 'Work Orders',
  '/engineers': 'Field Engineers',
  '/products': 'Products',
  '/requests': 'Product Requests',
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('first_name, last_name, role, is_active')
    .eq('id', user.id)
    .single()

  if (profile && !profile.is_active) {
    await supabase.auth.signOut()
    redirect('/login')
  }

  const userName = profile ? `${profile.first_name} ${profile.last_name}` : user.email || 'User'
  const userRole = profile?.role || 'User'

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar userName={userName} userRole={userRole} />
      <div style={{ marginLeft: 230, flex: 1, display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        {children}
      </div>
    </div>
  )
}
