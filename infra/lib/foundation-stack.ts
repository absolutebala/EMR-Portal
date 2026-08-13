import * as cdk from 'aws-cdk-lib/core'
import * as ec2 from 'aws-cdk-lib/aws-ec2'
import * as ecr from 'aws-cdk-lib/aws-ecr'
import * as ecs from 'aws-cdk-lib/aws-ecs'
import * as logs from 'aws-cdk-lib/aws-logs'
import { Construct } from 'constructs'

// Shared, rarely-changing infrastructure: VPC, ECR repo, log group, ECS cluster.
// Public subnets only (no NAT Gateway) — the user explicitly chose this over
// private-subnets-with-NAT to avoid the ~$32-35/mo NAT cost; the Fargate tasks'
// security group (defined in service-stack.ts) is what actually keeps them locked
// down, not subnet placement.
export class FoundationStack extends cdk.Stack {
  public readonly vpc: ec2.Vpc
  public readonly repository: ecr.Repository
  public readonly cluster: ecs.Cluster
  public readonly logGroup: logs.LogGroup

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props)

    this.vpc = new ec2.Vpc(this, 'EmrPortalVpc', {
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [
        { name: 'public', subnetType: ec2.SubnetType.PUBLIC, cidrMask: 24 },
      ],
    })

    // Mirrors the CI build in .github/workflows/deploy.yml (Phase 3) — that workflow
    // pushes here, the ECS task definition (Phase 4) pulls from here by tag.
    this.repository = new ecr.Repository(this, 'EmrPortalRepo', {
      repositoryName: 'emr-portal',
      imageScanOnPush: true,
      lifecycleRules: [
        // Keep the last 10 tagged images (git-SHA tags from CI) — untagged images
        // (superseded manifests from repeated pushes of the same tag) expire after 1 day.
        { tagStatus: ecr.TagStatus.UNTAGGED, maxImageAge: cdk.Duration.days(1) },
        { tagStatus: ecr.TagStatus.ANY, maxImageCount: 10 },
      ],
    })

    this.logGroup = new logs.LogGroup(this, 'EmrPortalLogGroup', {
      logGroupName: '/ecs/emr-portal',
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    })

    this.cluster = new ecs.Cluster(this, 'EmrPortalCluster', {
      vpc: this.vpc,
      clusterName: 'emr-portal',
      containerInsightsV2: ecs.ContainerInsights.DISABLED,
    })
  }
}
