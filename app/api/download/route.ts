import { NextRequest, NextResponse } from 'next/server'

// Streams a stored report asset back to the browser as a forced download with a short,
// precise filename. Direct CloudFront links open the raw file in a new tab (which for a
// .docx can leave a blank tab and feel like "nothing downloaded") and save it under the
// ugly UUID-timestamp S3 key. Proxying it same-origin lets us set Content-Disposition
// (guaranteeing a download) and a human filename. Restricted to our own CloudFront host
// so it can't be abused as an open proxy.
const CLOUDFRONT_DOMAIN = process.env.CLOUDFRONT_DOMAIN || 'd10atqfr8tij1p.cloudfront.net'

export async function GET(req: NextRequest) {
  const u = req.nextUrl.searchParams.get('u')
  const name = req.nextUrl.searchParams.get('n') || 'report'
  if (!u) return new NextResponse('Missing url', { status: 400 })

  let target: URL
  try { target = new URL(u) } catch { return new NextResponse('Bad url', { status: 400 }) }
  if (target.protocol !== 'https:' || target.host !== CLOUDFRONT_DOMAIN) {
    return new NextResponse('Forbidden host', { status: 403 })
  }

  const upstream = await fetch(target.toString())
  if (!upstream.ok || !upstream.body) return new NextResponse('File not found', { status: 404 })

  // Strip characters that aren't safe in a Content-Disposition filename.
  const safe = name.replace(/[^\w.\-() ]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || 'report'
  const contentType = upstream.headers.get('content-type') || 'application/octet-stream'

  return new NextResponse(upstream.body, {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${safe}"`,
      'Cache-Control': 'private, no-store',
    },
  })
}
