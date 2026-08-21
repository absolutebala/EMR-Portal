export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { getAuthedUser } from '@/lib/cognito/server'
import { requireMobilePasswordChanged } from '@/lib/mobile/authGuard'
import { getMyProfile } from '@/app/actions/update-my-profile'
import ProfileClient from './ProfileClient'

export default async function MobileProfilePage() {
  const user = await getAuthedUser()
  if (!user) redirect('/mobile/login')
  await requireMobilePasswordChanged(user.id)

  const { profile, error } = await getMyProfile()

  return <ProfileClient profile={profile} error={error} />
}
