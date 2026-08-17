import * as cdk from 'aws-cdk-lib/core'
import * as ec2 from 'aws-cdk-lib/aws-ec2'
import * as ecs from 'aws-cdk-lib/aws-ecs'
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2'
import * as ecr from 'aws-cdk-lib/aws-ecr'
import * as logs from 'aws-cdk-lib/aws-logs'
import * as iam from 'aws-cdk-lib/aws-iam'
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager'
import * as acm from 'aws-cdk-lib/aws-certificatemanager'
import { Construct } from 'constructs'

// portal.emr.global's CNAME points at this ALB (customer's own DNS host, outside AWS —
// see the CNAME handed to them during the AWS migration). Cert requested + DNS-validated
// out of band via `aws acm request-certificate` once the CNAME existed; referenced here
// by ARN rather than provisioned by this stack since CDK can't complete DNS validation
// against a third-party-hosted zone on its own.
const PORTAL_DOMAIN = 'portal.emr.global'
const PORTAL_CERT_ARN = 'arn:aws:acm:ap-south-2:945831803151:certificate/8ba57fae-bb20-4c72-bfbe-7170a4ac39f9'

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
  // Phase I cutover switch (proxy.ts) — true blocks the whole app with a 503 page.
  // A plain env var, so flipping it is a fast CDK-only deploy, no image rebuild.
  maintenanceMode: boolean
}

export class ServiceStack extends cdk.Stack {
  public readonly loadBalancer: elbv2.ApplicationLoadBalancer
  public readonly taskSecurityGroup: ec2.SecurityGroup
  public readonly taskRole: iam.Role

  constructor(scope: Construct, id: string, props: ServiceStackProps) {
    super(scope, id, props)

    const albSg = new ec2.SecurityGroup(this, 'AlbSecurityGroup', {
      vpc: props.vpc,
      description: 'EMR Portal ALB - public HTTP',
      allowAllOutbound: true,
    })
    albSg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), 'Public HTTP (redirects to HTTPS)')
    albSg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443), 'Public HTTPS')

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
    this.taskRole = taskRole

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
        // No Supabase dependency left at all as of this deploy — auth (Cognito), DB
        // (RDS/PostgREST), and storage (S3/CloudFront below) are all AWS-native, so
        // the Supabase account can be safely canceled.
        NEXT_PUBLIC_VAPID_PUBLIC_KEY: 'BDUG7j7J3eUCYwEmYr18c40F_CAvwPDmUx31t5ERG6vRoBvRMXWxyHJLcNGazXQK34ctqGWJW2UIdLutvqkOJOI',
        VAPID_SUBJECT: 'mailto:admin@emrglobal.com',
        NEXT_PUBLIC_SITE_URL: `https://${PORTAL_DOMAIN}`,
        NODE_ENV: 'production',
        MAINTENANCE_MODE: props.maintenanceMode ? 'true' : 'false',
        AWS_REGION: cdk.Stack.of(this).region,
        POSTGREST_URL: 'http://postgrest.emr-portal.local:3000',
        // Stable, already-created identifiers, not secrets — same "known value,
        // hardcoded" convention already used elsewhere in this file.
        COGNITO_USER_POOL_ID: 'ap-south-2_suiaA6XPc',
        COGNITO_WEB_CLIENT_ID: '7brt0h6l1qo5v2href4gv92ds8',
        COGNITO_MOBILE_CLIENT_ID: 'p1g74ckm0qa7bpa3fpng44qj',
        S3_BUCKET_NAME: 'emr-portal-assets-prod',
        CLOUDFRONT_DOMAIN: 'd10atqfr8tij1p.cloudfront.net',
      },
      secrets: {
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
      assignPublicIp: true, // required to pull the image from ECR — no NAT Gateway
      circuitBreaker: { enable: true, rollback: true },
      // With desiredCount 1, the 50% default minHealthyPercent floors to 0 — the old
      // task could be stopped before the new one is healthy. 100/200 forces a real
      // rolling deploy (new task up and healthy before the old one is torn down).
      minHealthyPercent: 100,
      maxHealthyPercent: 200,
    })

    const portalCert = acm.Certificate.fromCertificateArn(this, 'PortalCertificate', PORTAL_CERT_ARN)

    const httpsListener = this.loadBalancer.addListener('HttpsListener', {
      port: 443,
      open: false,
      certificates: [portalCert],
    })
    httpsListener.addTargets('EcsTargets', {
      port: 3000,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targets: [service],
      healthCheck: {
        path: '/api/health',
        healthyHttpCodes: '200',
        interval: cdk.Duration.seconds(30),
      },
    })

    // Plain HTTP now just redirects — the app itself no longer needs to be reachable
    // over unencrypted HTTP now that a real domain + cert exist.
    this.loadBalancer.addListener('HttpListener', {
      port: 80,
      open: false,
      defaultAction: elbv2.ListenerAction.redirect({ port: '443', protocol: 'HTTPS', permanent: true }),
    })

    new cdk.CfnOutput(this, 'LoadBalancerDnsName', { value: this.loadBalancer.loadBalancerDnsName })
  }
}
