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

// Phase I cutover, step 1: stage the new Cognito/RDS/PostgREST env vars (and
// MAINTENANCE_MODE=true) onto the CURRENTLY RUNNING old Supabase-based image first —
// harmless, since that old code doesn't read any of them. This means the moment
// CodeBuild's push-triggered deploy (step 2, git push) brings up the new
// Cognito-integrated code, MAINTENANCE_MODE is already baked in and it comes up
// straight into the maintenance page — no window where the new code is live but
// missing required config. imageTag stays on the old SHA here on purpose; it only
// moves forward once the real new-code deploy has happened (see the comment at
// Phase I step 4 below, when this flips MAINTENANCE_MODE back off).
const service = new ServiceStack(app, 'EmrPortalServiceStack', {
  env,
  vpc: foundation.vpc,
  cluster: foundation.cluster,
  repository: foundation.repository,
  logGroup: foundation.logGroup,
  imageTag: '22b8830d3d793946e8288c1a84f7ab5100db12a9',
  maintenanceMode: true,
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
