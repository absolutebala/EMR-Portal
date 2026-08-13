#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib/core'
import { FoundationStack } from '../lib/foundation-stack'
import { CicdStack } from '../lib/cicd-stack'
import { CodeBuildStack } from '../lib/codebuild-stack'

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
