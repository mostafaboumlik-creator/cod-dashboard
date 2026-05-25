import { createClient } from '@supabase/supabase-js'
import { notFound } from 'next/navigation'
import { LandingForm } from './LandingForm'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ productId: string }>
  searchParams: Promise<{ ref?: string }>
}

export default async function LandingPage({ params, searchParams }: Props) {
  const { productId } = await params
  const { ref: buyerId } = await searchParams

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data: product } = await supabase
    .from('products')
    .select('id, name, selling_price')
    .eq('id', productId)
    .eq('is_active', true)
    .single()

  if (!product) notFound()

  return (
    <LandingForm
      product={product}
      buyerId={buyerId || null}
    />
  )
}
