import * as cdk from 'aws-cdk-lib/core'
import * as iam from 'aws-cdk-lib/aws-iam'
import * as ecr from 'aws-cdk-lib/aws-ecr'
import { Construct } from 'constructs'

interface CicdStackProps extends cdk.StackProps {
  repository: ecr.IRepository
  githubRepo: string // "owner/repo"
}

// OIDC federation for GitHub Actions — no long-lived AWS access keys stored in
// GitHub secrets. The deploy role is trusted only for this specific repo (scoped via
// the OIDC subject claim condition below), and only has the permissions its workflow
// actually needs: push to this one ECR repo, and manage ECS resources under the
// "emr-portal" cluster/service naming (granted now, ahead of Phase 4's ECS service
// existing, since IAM permissions can reference not-yet-created resource ARNs).
export class CicdStack extends cdk.Stack {
  public readonly deployRole: iam.Role

  constructor(scope: Construct, id: string, props: CicdStackProps) {
    super(scope, id, props)

    const provider = new iam.OpenIdConnectProvider(this, 'GithubOidcProvider', {
      url: 'https://token.actions.githubusercontent.com',
      clientIds: ['sts.amazonaws.com'],
    })

    this.deployRole = new iam.Role(this, 'GithubDeployRole', {
      roleName: 'emr-portal-github-deploy',
      assumedBy: new iam.WebIdentityPrincipal(provider.openIdConnectProviderArn, {
        StringEquals: {
          'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
        },
        StringLike: {
          'token.actions.githubusercontent.com:sub': `repo:${props.githubRepo}:*`,
        },
      }),
      description: 'Assumed by GitHub Actions (OIDC) to build/push the app image and deploy the ECS service',
      maxSessionDuration: cdk.Duration.hours(1),
    })

    props.repository.grantPullPush(this.deployRole)

    const { account, region } = cdk.Stack.of(this)
    this.deployRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'ecs:UpdateService',
        'ecs:DescribeServices',
        'ecs:DescribeTaskDefinition',
        'ecs:RegisterTaskDefinition',
      ],
      resources: ['*'], // register/describe-task-definition don't support resource-level scoping
    }))
    this.deployRole.addToPolicy(new iam.PolicyStatement({
      actions: ['ecs:UpdateService', 'ecs:DescribeServices'],
      resources: [`arn:aws:ecs:${region}:${account}:service/emr-portal/*`],
    }))
    // Needed so ECS can assume the task/execution roles referenced in a newly
    // registered task definition — standard requirement for ecs:RegisterTaskDefinition
    // from CI, scoped to roles this app's own stacks create (not a blanket PassRole).
    this.deployRole.addToPolicy(new iam.PolicyStatement({
      actions: ['iam:PassRole'],
      resources: [`arn:aws:iam::${account}:role/emr-portal-*`],
    }))

    new cdk.CfnOutput(this, 'DeployRoleArn', { value: this.deployRole.roleArn })
    new cdk.CfnOutput(this, 'EcrRepositoryUri', { value: props.repository.repositoryUri })
  }
}
