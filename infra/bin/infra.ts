#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib/core'
import { FoundationStack } from '../lib/foundation-stack'
import { CicdStack } from '../lib/cicd-stack'
import { CodeBuildStack } from '../lib/codebuild-stack'
import { ServiceStack } from '../lib/service-stack'
import { CronStack } from '../lib/cron-stack'
import { AuthStack } from '../lib/auth-stack'
import { DataStack } from '../lib/data-stack'
import { StorageStack } from '../lib/storage-stack'
import { PostgrestStack } from '../lib/postgrest-stack'

const app = new cdk.App()

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION || 'ap-south-2',
}

const foundation = new FoundationStack(app, 'EmrPortalFoundationStack', { env })

// Dormant — GitHub Actions is blocked by a billing lock on the user's GitHub account.
// Left in place (not deleted) in case that gets resolved and this pipeline is revived.
new CicdStack(app, 'EmrPortalCicdStack', {
  env,
  repository: foundation.repository,
  githubRepo: 'absolutebala/EMR-Portal',
})

// Active CI/CD path — AWS-native, no dependency on GitHub Actions.
new CodeBuildStack(app, 'EmrPortalCodeBuildStack', {
  env,
  repository: foundation.repository,
  githubOwner: 'absolutebala',
  githubRepo: 'EMR-Portal',
})

const service = new ServiceStack(app, 'EmrPortalServiceStack', {
  env,
  vpc: foundation.vpc,
  cluster: foundation.cluster,
  repository: foundation.repository,
  logGroup: foundation.logGroup,
  imageTag: '22b8830d3d793946e8288c1a84f7ab5100db12a9',
})

new CronStack(app, 'EmrPortalCronStack', {
  env,
  albDnsName: service.loadBalancer.loadBalancerDnsName,
})

// Supabase -> AWS-native migration, Phases A/B. Additive/standalone — no existing
// stack or app code depends on either of these yet.
new AuthStack(app, 'EmrPortalAuthStack', { env })

const data = new DataStack(app, 'EmrPortalDataStack', {
  env,
  vpc: foundation.vpc,
  taskSecurityGroup: service.taskSecurityGroup,
})

new StorageStack(app, 'EmrPortalStorageStack', { env })

// Phase D0 — self-hosted PostgREST in front of RDS, so the app's 62 .from()/.select()
// call sites don't need a full rewrite to raw SQL. Depends on DataStack's RDS instance
// (via the emr-portal/PGRST_DB_URI secret, composed out-of-band) and reuses the app
// service's task security group as the only allowed inbound source.
new PostgrestStack(app, 'EmrPortalPostgrestStack', {
  env,
  vpc: foundation.vpc,
  cluster: foundation.cluster,
  taskSecurityGroup: service.taskSecurityGroup,
  dbSecurityGroup: data.dbSecurityGroup,
})
