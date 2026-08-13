import * as cdk from 'aws-cdk-lib/core'
import * as ec2 from 'aws-cdk-lib/aws-ec2'
import * as ecs from 'aws-cdk-lib/aws-ecs'
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2'
import * as ecr from 'aws-cdk-lib/aws-ecr'
import * as logs from 'aws-cdk-lib/aws-logs'
import * as iam from 'aws-cdk-lib/aws-iam'
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager'
import { Construct } from 'constructs'

interface ServiceStackProps extends cdk.StackProps {
  vpc: ec2.Vpc
  cluster: ecs.Cluster
  repository: ecr.IRepository
  logGroup: logs.LogGroup
  // The exact tag CodeBuild already pushed — see buildspec.yml (git SHA). Bring the
  // service up on this first, then re-run CodeBuild once this stack's ALB DNS name is
  // known (needed for NEXT_PUBLIC_SITE_URL's client-bundle half, which is baked in at
  // Docker build time — a runtime env var here can only ever fix the server-side half).
  imageTag: string
}

export class ServiceStack extends cdk.Stack {
  public readonly loadBalancer: elbv2.ApplicationLoadBalancer
  public readonly taskSecurityGroup: ec2.SecurityGroup

  constructor(scope: Construct, id: string, props: ServiceStackProps) {
    super(scope, id, props)

    const albSg = new ec2.SecurityGroup(this, 'AlbSecurityGroup', {
      vpc: props.vpc,
      description: 'EMR Portal ALB - public HTTP',
      allowAllOutbound: true,
    })
    albSg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), 'Public HTTP')

    const taskSg = new ec2.SecurityGroup(this, 'TaskSecurityGroup', {
      vpc: props.vpc,
      description: 'EMR Portal Fargate tasks - only reachable from the ALB',
      allowAllOutbound: true,
    })
    taskSg.addIngressRule(albSg, ec2.Port.tcp(3000), 'From ALB only')
    this.taskSecurityGroup = taskSg

    // Created before the task definition specifically so its DNS name (a CloudFormation
    // Fn::GetAtt, no dependency on the service/task definition at the resource level)
    // can be used as this container's NEXT_PUBLIC_SITE_URL — correct on this very first
    // deploy for server-side reads.
    this.loadBalancer = new elbv2.ApplicationLoadBalancer(this, 'Alb', {
      vpc: props.vpc,
      internetFacing: true,
      securityGroup: albSg,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
    })

    const executionRole = new iam.Role(this, 'TaskExecutionRole', {
      roleName: 'emr-portal-task-execution-role',
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonECSTaskExecutionRolePolicy'),
      ],
    })
    props.repository.grantPull(executionRole)

    const taskRole = new iam.Role(this, 'TaskRole', {
      roleName: 'emr-portal-task-role',
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
    })

    const serviceRoleKey = secretsmanager.Secret.fromSecretNameV2(this, 'SupabaseServiceRoleKeySecret', 'emr-portal/SUPABASE_SERVICE_ROLE_KEY')
    const vapidPrivateKey = secretsmanager.Secret.fromSecretNameV2(this, 'VapidPrivateKeySecret', 'emr-portal/VAPID_PRIVATE_KEY')
    const cronSecret = secretsmanager.Secret.fromSecretNameV2(this, 'CronSecret', 'emr-portal/CRON_SECRET')

    const taskDefinition = new ecs.FargateTaskDefinition(this, 'TaskDefinition', {
      family: 'emr-portal',
      cpu: 512,
      memoryLimitMiB: 1024,
      executionRole,
      taskRole,
    })

    taskDefinition.addContainer('emr-portal', {
      image: ecs.ContainerImage.fromEcrRepository(props.repository, props.imageTag),
      containerName: 'emr-portal',
      portMappings: [{ containerPort: 3000 }],
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: 'emr-portal', logGroup: props.logGroup }),
      environment: {
        NEXT_PUBLIC_SUPABASE_URL: 'https://tlakzrkpzxoeycpglxwf.supabase.co',
        NEXT_PUBLIC_SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRsYWt6cmtwenhvZXljcGdseHdmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI3MDgzNDAsImV4cCI6MjA5ODI4NDM0MH0.fA7NhEDqOTW8bT0MKCsSL9ngcgfsFTvkt0-nBBl-nnQ',
        NEXT_PUBLIC_VAPID_PUBLIC_KEY: 'BDUG7j7J3eUCYwEmYr18c40F_CAvwPDmUx31t5ERG6vRoBvRMXWxyHJLcNGazXQK34ctqGWJW2UIdLutvqkOJOI',
        VAPID_SUBJECT: 'mailto:admin@emrglobal.com',
        NEXT_PUBLIC_SITE_URL: `http://${this.loadBalancer.loadBalancerDnsName}`,
        NODE_ENV: 'production',
      },
      secrets: {
        SUPABASE_SERVICE_ROLE_KEY: ecs.Secret.fromSecretsManager(serviceRoleKey),
        VAPID_PRIVATE_KEY: ecs.Secret.fromSecretsManager(vapidPrivateKey),
        CRON_SECRET: ecs.Secret.fromSecretsManager(cronSecret),
      },
    })

    const service = new ecs.FargateService(this, 'Service', {
      serviceName: 'emr-portal',
      cluster: props.cluster,
      taskDefinition,
      desiredCount: 1,
      securityGroups: [taskSg],
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      assignPublicIp: true, // required to pull the image / reach Supabase — no NAT Gateway
      circuitBreaker: { enable: true, rollback: true },
      // With desiredCount 1, the 50% default minHealthyPercent floors to 0 — the old
      // task could be stopped before the new one is healthy. 100/200 forces a real
      // rolling deploy (new task up and healthy before the old one is torn down).
      minHealthyPercent: 100,
      maxHealthyPercent: 200,
    })

    const listener = this.loadBalancer.addListener('HttpListener', { port: 80, open: false })
    listener.addTargets('EcsTargets', {
      port: 3000,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targets: [service],
      healthCheck: {
        path: '/api/health',
        healthyHttpCodes: '200',
        interval: cdk.Duration.seconds(30),
      },
    })

    new cdk.CfnOutput(this, 'LoadBalancerDnsName', { value: this.loadBalancer.loadBalancerDnsName })
  }
}
