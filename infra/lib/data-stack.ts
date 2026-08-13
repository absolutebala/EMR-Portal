import * as cdk from 'aws-cdk-lib/core'
import * as ec2 from 'aws-cdk-lib/aws-ec2'
import * as rds from 'aws-cdk-lib/aws-rds'
import * as lambdaNode from 'aws-cdk-lib/aws-lambda-nodejs'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import * as path from 'path'
import { Construct } from 'constructs'

interface DataStackProps extends cdk.StackProps {
  vpc: ec2.Vpc
  taskSecurityGroup: ec2.SecurityGroup
}

// Replaces Supabase's managed Postgres. Single-AZ (user explicitly accepted the
// downtime-on-AZ-failure trade-off over Multi-AZ's ~2x cost), db.t4g.micro, 20GB gp3
// — matches the ~$13-15/mo budget target. Same "same public subnets, no NAT Gateway"
// network trade-off as the rest of this app's infra: publiclyAccessible:false and a
// security group scoped to only the ECS task SG keeps this off the public internet
// without paying for a NAT Gateway just to reach it from a private subnet instead.
export class DataStack extends cdk.Stack {
  public readonly instance: rds.DatabaseInstance
  public readonly dbSecurityGroup: ec2.SecurityGroup
  public readonly schemaRunner: lambdaNode.NodejsFunction

  constructor(scope: Construct, id: string, props: DataStackProps) {
    super(scope, id, props)

    this.dbSecurityGroup = new ec2.SecurityGroup(this, 'DbSecurityGroup', {
      vpc: props.vpc,
      description: 'EMR Portal RDS - only reachable from the ECS task security group',
      allowAllOutbound: false,
    })
    this.dbSecurityGroup.addIngressRule(props.taskSecurityGroup, ec2.Port.tcp(5432), 'From ECS tasks only')

    this.instance = new rds.DatabaseInstance(this, 'Database', {
      instanceIdentifier: 'emr-portal-db',
      // 16.4 isn't offered in ap-south-2 (a newer region with a narrower version
      // list) — 16.13 is the highest 16.x this region actually has.
      engine: rds.DatabaseInstanceEngine.postgres({ version: rds.PostgresEngineVersion.VER_16_13 }),
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.BURSTABLE4_GRAVITON, ec2.InstanceSize.MICRO),
      vpc: props.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      securityGroups: [this.dbSecurityGroup],
      publiclyAccessible: false,
      multiAz: false,
      allocatedStorage: 20,
      storageType: rds.StorageType.GP3,
      databaseName: 'emrportal',
      credentials: rds.Credentials.fromGeneratedSecret('postgres', {
        secretName: 'emr-portal/RDS_CREDENTIALS',
      }),
      // 7 days hit "exceeds the maximum available to free tier customers" — this AWS
      // account appears to be RDS free-tier eligible, which is good news for the
      // budget (db.t4g.micro / 20GB may end up free for the first 12 months). 1 day
      // fits the free-tier backup allowance.
      backupRetention: cdk.Duration.days(1),
      // No production data lives here yet (Phase B/C are schema replay + dry-run data
      // migration while Supabase stays authoritative) — deletion protection stays off
      // during iteration, and gets flipped on deliberately before Phase C's real data
      // load / Phase I's cutover.
      deletionProtection: false,
      removalPolicy: cdk.RemovalPolicy.SNAPSHOT,
    })

    new cdk.CfnOutput(this, 'DbEndpoint', { value: this.instance.dbInstanceEndpointAddress })
    new cdk.CfnOutput(this, 'DbPort', { value: this.instance.dbInstanceEndpointPort })

    // One-off migration runner (Phase B) — RDS has no public access, so this is the
    // only way to run SQL against it from outside the VPC. Attached to the same SG the
    // ECS task uses (already allowed through DbSecurityGroup's ingress rule above, no
    // new access needed). Invoked directly via `aws lambda invoke` with a JSON payload
    // of {name, sql} migration files plus db credentials — reusable for any future
    // one-off SQL work too.
    //
    // DB credentials are passed in the invocation payload, not fetched here via
    // Secrets Manager: this Lambda has no internet route (no NAT Gateway, and it must
    // be VPC-attached to reach RDS), so a Secrets Manager API call from inside it would
    // time out the same way a direct RDS connection would from outside the VPC. The
    // invoker (outside the VPC) fetches the secret and passes it in instead.
    this.schemaRunner = new lambdaNode.NodejsFunction(this, 'SchemaRunner', {
      functionName: 'emr-portal-schema-runner',
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, '..', 'lambda', 'schema-runner', 'index.ts'),
      handler: 'handler',
      timeout: cdk.Duration.minutes(5),
      memorySize: 256,
      vpc: props.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      // This VPC has no NAT Gateway, so "public subnet" is the only subnet type it
      // has at all -- CDK's default guard against Lambda-in-public-subnet assumes the
      // function needs internet access, which this one doesn't (it only talks to RDS,
      // VPC-internal traffic, no NAT/internet route required).
      allowPublicSubnet: true,
      securityGroups: [props.taskSecurityGroup],
    })
  }
}
