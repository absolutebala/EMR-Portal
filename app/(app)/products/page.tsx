import { getAuthedUser } from '@/lib/cognito/server'
import { getProductsCatalog } from '@/app/actions/products'
import ProductsPageClient from './ProductsPageClient'
import { adminClient } from '@/lib/db/admin-client'

export default async function ProductsPage() {
  const user = await getAuthedUser()

  const [{ data: profile }, { products }] = await Promise.all([
    adminClient().from('profiles').select('first_name,last_name,role').eq('id', user!.id).single(),
    getProductsCatalog(),
  ])

  const userName = profile ? `${profile.first_name} ${profile.last_name}` : 'User'
  const userRole = profile?.role || 'User'

  return <ProductsPageClient products={products} userName={userName} userRole={userRole} />
}
