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

// Phase I cutover, step 4: CodeBuild's push-triggered deploy already replaced the
// running image with this exact SHA (confirmed live against the deployed task
// definition) — imageTag updated here to match, so this CDK deploy doesn't
// accidentally revert it back to the old Supabase-based image. Data verified
// consistent between Supabase and RDS (all 31 tables, exact row-level match, no drift
// since Phase C — the app saw no real writes during the migration window) and storage
// (8/8 files match), so no sync was needed. maintenanceMode flips to false here.
const service = new ServiceStack(app, 'EmrPortalServiceStack', {
  env,
  vpc: foundation.vpc,
  cluster: foundation.cluster,
  repository: foundation.repository,
  logGroup: foundation.logGroup,
  imageTag: '44b0392e6bb2eefdaa562e8e1b2e5930b5154c36',
  maintenanceMode: false,
})

new CronStack(app, 'EmrPortalCronStack', {
  env,
  albDnsName: service.loadBalancer.loadBalancerDnsName,
})

const data = new DataStack(app, 'EmrPortalDataStack', {
  env,
  vpc: foundation.vpc,
  taskSecurityGroup: service.taskSecurityGroup,
})

// Supabase -> AWS-native migration, Phases A/B/G. Additive/standalone — no existing
// stack or app code depends on this until Phase I's cutover. Depends on DataStack (not
// ServiceStack) for its post-authentication Lambda's RDS access — reusing
// ServiceStack's task SG here would create a cycle with the IAM grant below, which
// makes ServiceStack depend on this stack's userPool.
const auth = new AuthStack(app, 'EmrPortalAuthStack', {
  env,
  vpc: foundation.vpc,
  dbSecurityGroup: data.dbSecurityGroup,
})

// Phase F: admin API rewrite (invite/delete/reset-password) uses Cognito's Admin*
// APIs, which — unlike InitiateAuth/RespondToAuthChallenge/ForgotPassword (Phases D/E,
// no IAM auth required at all) — do require an explicit IAM grant on the caller.
// Added now even though this app code isn't deployed yet: an IAM policy grant doesn't
// replace or restart the running task, so there's no live-production risk in doing
// this ahead of Phase I's actual cutover.
auth.userPool.grant(
  service.taskRole,
  'cognito-idp:AdminCreateUser',
  'cognito-idp:AdminDeleteUser',
  'cognito-idp:AdminSetUserPassword',
  'cognito-idp:AdminInitiateAuth',
)

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
