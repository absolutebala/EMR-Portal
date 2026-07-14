export const dynamic = 'force-dynamic'

import WorkOrderDetailPageClient from './WorkOrderDetailPageClient'

interface Props {
  params: Promise<{ id: string }>
}

export default async function WorkOrderDetailPage({ params }: Props) {
  const { id } = await params
  return <WorkOrderDetailPageClient workOrderId={id} />
}
