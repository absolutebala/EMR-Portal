import * as cdk from 'aws-cdk-lib/core'
import * as ec2 from 'aws-cdk-lib/aws-ec2'
import * as ecs from 'aws-cdk-lib/aws-ecs'
import * as logs from 'aws-cdk-lib/aws-logs'
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager'
import * as servicediscovery from 'aws-cdk-lib/aws-servicediscovery'
import { Construct } from 'constructs'

interface PostgrestStackProps extends cdk.StackProps {
  vpc: ec2.Vpc
  cluster: ecs.Cluster
  taskSecurityGroup: ec2.SecurityGroup
}

// Self-hosted PostgREST (the same open-source engine Supabase's Data API runs on) in
// front of RDS. Added after discovering the app's 62 data-access files use the
// Supabase JS client's .from()/.select() PostgREST query builder — including
// PostgREST-only nested relational joins — as the actual database layer, not just for
// auth. Self-hosting this lets those call sites keep working almost unchanged instead
// of a full rewrite to raw SQL/an ORM.
//
// Single DB role (PGRST_DB_ANON_ROLE), no JWT config: RLS was already dropped when the
// schema was replayed onto RDS (Phase B decision — authorization is 100% app-layer,
// matching the app's actual pre-migration runtime behavior via the Supabase
// service-role client), so there's no meaningful "anon vs authenticated" distinction
// left at the DB layer. Not exposed via the ALB — internal-only, reached by the app's
// ECS task through Cloud Map private DNS, same no-NAT/public-subnet/SG-locked-down
// pattern as the rest of this app's infra (needs internet only to pull the image from
// Docker Hub; RDS access itself is VPC-internal).
export class PostgrestStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: PostgrestStackProps) {
    super(scope, id, props)

    const namespace = new servicediscovery.PrivateDnsNamespace(this, 'Namespace', {
      name: 'emr-portal.local',
      vpc: props.vpc,
    })

    const sg = new ec2.SecurityGroup(this, 'PostgrestSecurityGroup', {
      vpc: props.vpc,
      description: 'EMR Portal PostgREST - only reachable from the ECS app task',
      allowAllOutbound: true,
    })
    sg.addIngressRule(props.taskSecurityGroup, ec2.Port.tcp(3000), 'From app task only')

    // PGRST_DB_URI needs to be one complete connection string, but RDS's
    // fromGeneratedSecret stores host/port/dbname/username/password as separate JSON
    // fields, and CloudFormation dynamic references (the safe, template-doesn't-embed-
    // the-plaintext mechanism used everywhere else in this project) can't be
    // concatenated into a single derived string. So this secret is pre-composed
    // out-of-band (fetched from the RDS secret and written here via the AWS CLI/SDK
    // without ever printing the value) rather than declared inline in this stack.
    const dbUriSecret = secretsmanager.Secret.fromSecretNameV2(this, 'PgrstDbUriSecret', 'emr-portal/PGRST_DB_URI')

    const logGroup = new logs.LogGroup(this, 'PostgrestLogGroup', {
      logGroupName: '/ecs/emr-portal-postgrest',
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    })

    const taskDefinition = new ecs.FargateTaskDefinition(this, 'TaskDefinition', {
      family: 'emr-portal-postgrest',
      cpu: 256,
      memoryLimitMiB: 512,
    })

    taskDefinition.addContainer('postgrest', {
      image: ecs.ContainerImage.fromRegistry('postgrest/postgrest:v12.2.8'),
      containerName: 'postgrest',
      portMappings: [{ containerPort: 3000 }],
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: 'postgrest', logGroup }),
      environment: {
        PGRST_DB_SCHEMA: 'public',
        PGRST_DB_ANON_ROLE: 'postgres',
        // RLS is dropped app-wide (Phase B) so there's no per-request identity needed
        // at the DB layer, but PostgREST still requires *some* max-rows safety net.
        PGRST_DB_MAX_ROWS: '10000',
      },
      secrets: {
        PGRST_DB_URI: ecs.Secret.fromSecretsManager(dbUriSecret),
      },
    })

    new ecs.FargateService(this, 'Service', {
      serviceName: 'emr-portal-postgrest',
      cluster: props.cluster,
      taskDefinition,
      desiredCount: 1,
      securityGroups: [sg],
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      assignPublicIp: true, // required to pull the image from Docker Hub - no NAT Gateway
      circuitBreaker: { enable: true, rollback: true },
      minHealthyPercent: 100,
      maxHealthyPercent: 200,
      cloudMapOptions: {
        name: 'postgrest',
        cloudMapNamespace: namespace,
        dnsRecordType: servicediscovery.DnsRecordType.A,
        dnsTtl: cdk.Duration.seconds(10),
      },
    })
  }
}
