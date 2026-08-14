import * as cdk from 'aws-cdk-lib/core'
import * as codebuild from 'aws-cdk-lib/aws-codebuild'
import * as ecr from 'aws-cdk-lib/aws-ecr'
import * as iam from 'aws-cdk-lib/aws-iam'
import { Construct } from 'constructs'

interface CodeBuildStackProps extends cdk.StackProps {
  repository: ecr.IRepository
  githubOwner: string
  githubRepo: string
}

// Replaces the GitHub-Actions-based pipeline (infra/lib/cicd-stack.ts) after the
// user's GitHub account hit a billing lock that blocked Actions entirely — fully
// AWS-native instead: CodeBuild pulls source via a GitHub PAT (stored in Secrets
// Manager, imported as account-level GitHub credentials below), builds/pushes the
// Docker image, and deploys to ECS. Triggered by a webhook on push to main, same
// trigger condition the GitHub Actions workflow used.
export class CodeBuildStack extends cdk.Stack {
  public readonly project: codebuild.Project

  constructor(scope: Construct, id: string, props: CodeBuildStackProps) {
    super(scope, id, props)

    // Account-level GitHub credentials for CodeBuild — one set per AWS account/region,
    // shared by any CodeBuild project that uses a GitHub source in this account.
    new codebuild.GitHubSourceCredentials(this, 'GithubCreds', {
      accessToken: cdk.SecretValue.secretsManager('emr-portal/GITHUB_TOKEN'),
    })

    this.project = new codebuild.Project(this, 'DeployProject', {
      projectName: 'emr-portal-deploy',
      source: codebuild.Source.gitHub({
        owner: props.githubOwner,
        repo: props.githubRepo,
        webhook: true,
        webhookFilters: [
          codebuild.FilterGroup.inEventOf(codebuild.EventAction.PUSH).andBranchIs('main'),
        ],
      }),
      buildSpec: codebuild.BuildSpec.fromSourceFilename('buildspec.yml'),
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
        privileged: true, // required for `docker build` inside the CodeBuild container
        computeType: codebuild.ComputeType.SMALL,
      },
      environmentVariables: {
        AWS_REGION: { value: cdk.Stack.of(this).region },
        ECR_REGISTRY: { value: props.repository.repositoryUri.split('/')[0] },
        ECR_REPOSITORY: { value: props.repository.repositoryName },
        // NEXT_PUBLIC_* build args — public values, fine as plaintext project env vars.
        // Supabase vars removed entirely (2026-08-14 Supabase cutoff) — nothing in the
        // client bundle has needed them since auth moved server-side to Cognito.
        NEXT_PUBLIC_VAPID_PUBLIC_KEY: { value: 'BDUG7j7J3eUCYwEmYr18c40F_CAvwPDmUx31t5ERG6vRoBvRMXWxyHJLcNGazXQK34ctqGWJW2UIdLutvqkOJOI' },
        NEXT_PUBLIC_SITE_URL: { value: 'http://EmrPor-Alb16-6ThX6OgVuHrJ-1597119572.ap-south-2.elb.amazonaws.com' },
      },
    })

    props.repository.grantPullPush(this.project)

    const { account, region } = cdk.Stack.of(this)
    this.project.addToRolePolicy(new iam.PolicyStatement({
      actions: ['ecs:DescribeTaskDefinition', 'ecs:RegisterTaskDefinition'],
      resources: ['*'], // these two actions don't support resource-level scoping
    }))
    this.project.addToRolePolicy(new iam.PolicyStatement({
      actions: ['ecs:UpdateService', 'ecs:DescribeServices'],
      resources: [`arn:aws:ecs:${region}:${account}:service/emr-portal/*`],
    }))
    this.project.addToRolePolicy(new iam.PolicyStatement({
      actions: ['iam:PassRole'],
      resources: [`arn:aws:iam::${account}:role/emr-portal-*`],
    }))

    new cdk.CfnOutput(this, 'ProjectName', { value: this.project.projectName })
  }
}
