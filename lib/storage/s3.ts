import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'

const S3_BUCKET = process.env.S3_BUCKET_NAME || 'emr-portal-assets-prod'
const CLOUDFRONT_DOMAIN = process.env.CLOUDFRONT_DOMAIN || 'd10atqfr8tij1p.cloudfront.net'

let cachedClient: S3Client | undefined
function getS3Client(): S3Client {
  if (!cachedClient) cachedClient = new S3Client({})
  return cachedClient
}

// Replaces Supabase Storage's "assets" bucket — same key structure preserved
// (checkins/, visit-pdfs/, visit-docs/, expenses/, product-requests/, logos/), now
// uploading directly to S3 with CloudFront serving the public URL (see
// infra/lib/storage-stack.ts). Returns null on failure rather than throwing, matching
// every call site's existing "log and continue" pattern — a failed photo upload
// shouldn't fail the whole checkin/expense/request submission it's attached to.
export async function uploadAsset(key: string, body: Buffer, contentType: string): Promise<string | null> {
  try {
    await getS3Client().send(new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    }))
    return `https://${CLOUDFRONT_DOMAIN}/${key}`
  } catch (e) {
    console.error(`uploadAsset failed for key ${key}:`, e)
    return null
  }
}
