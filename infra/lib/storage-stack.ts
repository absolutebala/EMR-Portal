import * as cdk from 'aws-cdk-lib/core'
import * as s3 from 'aws-cdk-lib/aws-s3'
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront'
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins'
import { Construct } from 'constructs'

// Replaces the Supabase Storage "assets" bucket. Same 6 key prefixes preserved
// 1:1 (checkins/, visit-pdfs/, visit-docs/, expenses/, product-requests/, logos/) so
// the data-migration URL rewrite (Phase C) is a base-URL swap, not a key remap.
//
// Fronted by CloudFront + Origin Access Control rather than a raw public bucket —
// same effective public-read UX (every current photo_url/pdf_url/word_url is already
// public, no signed-URL usage anywhere in the app), but the bucket itself stays
// private and only CloudFront can read it. Also gives a stable HTTPS URL for uploaded
// assets ahead of the ALB getting a real domain/cert (mixed-content risk mitigation).
export class StorageStack extends cdk.Stack {
  public readonly bucket: s3.Bucket
  public readonly distribution: cloudfront.Distribution

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props)

    this.bucket = new s3.Bucket(this, 'AssetsBucket', {
      bucketName: 'emr-portal-assets-prod',
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    })

    this.distribution = new cloudfront.Distribution(this, 'AssetsDistribution', {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(this.bucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      },
      comment: 'emr-portal-assets',
    })

    new cdk.CfnOutput(this, 'BucketName', { value: this.bucket.bucketName })
    new cdk.CfnOutput(this, 'DistributionDomainName', { value: this.distribution.distributionDomainName })
  }
}
