import { createClient, getAuthedUser } from '@/lib/supabase/server'
import { getProductsCatalog } from '@/app/actions/products'
import ProductsPageClient from './ProductsPageClient'

export default async function ProductsPage() {
  const supabase = await createClient()
  const user = await getAuthedUser(supabase)

  const [{ data: profile }, { products }] = await Promise.all([
    supabase.from('profiles').select('first_name,last_name,role').eq('id', user!.id).single(),
    getProductsCatalog(),
  ])

  const userName = profile ? `${profile.first_name} ${profile.last_name}` : 'User'
  const userRole = profile?.role || 'User'

  return <ProductsPageClient products={products} userName={userName} userRole={userRole} />
}
