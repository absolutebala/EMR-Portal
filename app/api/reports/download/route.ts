import { NextRequest, NextResponse } from 'next/server'
import { adminClient } from '@/lib/db/admin-client'
import { renderSubmissionReportCore } from '@/lib/mobile/core/workOrders'

// On-demand report download: builds the Word/PDF for a submitted form live from its
// data using the current template, so both formats always download for any submission
// (no reliance on files generated at submit time). Streamed as a forced attachment with
// a short, precise filename.
export async function GET(req: NextRequest) {
  const submission = req.nextUrl.searchParams.get('submission')
  const format = req.nextUrl.searchParams.get('format') === 'pdf' ? 'pdf' : 'word'
  if (!submission) return new NextResponse('Missing submission', { status: 400 })

  const res = await renderSubmissionReportCore(adminClient(), submission, format)
  if ('error' in res) return new NextResponse(res.error, { status: 404 })

  const safe = res.filename.replace(/[^\w.\-() ]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || 'report'
  return new NextResponse(new Uint8Array(res.buffer), {
    headers: {
      'Content-Type': res.contentType,
      'Content-Disposition': `attachment; filename="${safe}"`,
      'Cache-Control': 'private, no-store',
    },
  })
}
