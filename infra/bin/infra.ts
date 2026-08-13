#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib/core'
import { FoundationStack } from '../lib/foundation-stack'
import { CicdStack } from '../lib/cicd-stack'
import { CodeBuildStack } from '../lib/codebuild-stack'
import { ServiceStack } from '../lib/service-stack'
import { CronStack } from '../lib/cron-stack'
import { AuthStack } from '../lib/auth-stack'
import { DataStack } from '../lib/data-stack'

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

new DataStack(app, 'EmrPortalDataStack', {
  env,
  vpc: foundation.vpc,
  taskSecurityGroup: service.taskSecurityGroup,
})
