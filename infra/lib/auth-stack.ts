import * as cdk from 'aws-cdk-lib/core'
import * as cognito from 'aws-cdk-lib/aws-cognito'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import * as lambdaNode from 'aws-cdk-lib/aws-lambda-nodejs'
import * as ec2 from 'aws-cdk-lib/aws-ec2'
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager'
import * as path from 'path'
import { Construct } from 'constructs'

interface AuthStackProps extends cdk.StackProps {
  vpc: ec2.Vpc
  dbSecurityGroup: ec2.SecurityGroup
}

// Replaces Supabase Auth. Deliberately does NOT mirror profiles.must_change_password
// into a custom Cognito attribute — Cognito's own UserStatus (FORCE_CHANGE_PASSWORD vs
// CONFIRMED) is read only at the login-challenge moment, profiles.must_change_password
// stays the single source of truth everywhere else in the app, same as today.
export class AuthStack extends cdk.Stack {
  public readonly userPool: cognito.UserPool
  public readonly webClient: cognito.UserPoolClient
  public readonly mobileClient: cognito.UserPoolClient
  public readonly migrationFunction: lambdaNode.NodejsFunction
  public readonly postAuthFunction: lambdaNode.NodejsFunction

  constructor(scope: Construct, id: string, props: AuthStackProps) {
    super(scope, id, props)

    const supabaseDbUrlSecret = secretsmanager.Secret.fromSecretNameV2(this, 'SupabaseDbUrlSecret', 'emr-portal/SUPABASE_DB_URL')
    const pgrstDbUriSecret = secretsmanager.Secret.fromSecretNameV2(this, 'PgrstDbUriSecretRef', 'emr-portal/PGRST_DB_URI')

    // UserMigration_Authentication trigger — verifies a not-yet-migrated user's
    // password against Supabase's bcrypt hash on their first post-cutover login (see
    // infra/lambda/user-migration for the full design rationale). NOT VPC-attached —
    // needs internet to reach Supabase's public Postgres endpoint, and this VPC has no
    // NAT Gateway.
    this.migrationFunction = new lambdaNode.NodejsFunction(this, 'MigrationFunction', {
      functionName: 'emr-portal-user-migration',
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, '..', 'lambda', 'user-migration', 'index.ts'),
      handler: 'handler',
      timeout: cdk.Duration.seconds(15),
      memorySize: 256,
      bundling: { externalModules: ['@aws-sdk/client-secrets-manager'] },
    })
    supabaseDbUrlSecret.grantRead(this.migrationFunction)

    // PostAuthentication trigger — fires after every successful sign-in, including a
    // just-migrated user's first one, and is the first point profiles.cognito_sub can
    // be linked (the migration trigger above runs before Cognito generates the user's
    // sub). VPC-attached — reaches RDS (VPC-internal only), not Supabase.
    //
    // Its own security group (not the app task's) — reusing that one would make this
    // stack depend on ServiceStack for the SG, while ServiceStack's task role also
    // needs this stack's userPool for its Cognito Admin* IAM grant (see infra.ts) —
    // a genuine circular dependency between the two stacks. This SG only needs an
    // explicit ingress grant on DataStack's RDS security group instead (same pattern
    // PostgrestStack uses).
    const postAuthSg = new ec2.SecurityGroup(this, 'PostAuthSecurityGroup', {
      vpc: props.vpc,
      description: 'EMR Portal post-authentication Lambda - outbound to RDS only',
      allowAllOutbound: true,
    })
    props.dbSecurityGroup.addIngressRule(postAuthSg, ec2.Port.tcp(5432), 'From post-authentication Lambda only')

    this.postAuthFunction = new lambdaNode.NodejsFunction(this, 'PostAuthFunction', {
      functionName: 'emr-portal-post-authentication',
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, '..', 'lambda', 'post-authentication', 'index.ts'),
      handler: 'handler',
      timeout: cdk.Duration.seconds(15),
      memorySize: 256,
      vpc: props.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      allowPublicSubnet: true,
      securityGroups: [postAuthSg],
      // Deliberate, user-approved tradeoff: this Lambda is VPC-attached (to reach
      // RDS) with no NAT Gateway, so it has no route to Secrets Manager's API at
      // runtime — the same constraint schema-runner solved with credentials passed
      // in its invocation payload, which isn't an option here since Cognito (not us)
      // controls this Lambda's payload. unsafeUnwrap() bakes the connection string
      // into this Lambda's config at deploy time via a CloudFormation dynamic
      // reference (resolved server-side, never appears in the synthesized template
      // file) instead of fetching it over the network. This does mean anyone who can
      // read this Lambda's configuration can see the value in plaintext — acceptable
      // here since this is a single-admin AWS account where that's already true of
      // every other secret in this migration via the Secrets Manager console.
      environment: {
        DB_URI: pgrstDbUriSecret.secretValue.unsafeUnwrap(),
      },
    })

    this.userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: 'emr-portal-users',
      selfSignUpEnabled: false, // admins create users (AdminCreateUser), matches current invite-only flow
      signInAliases: { email: true, username: false },
      autoVerify: { email: false }, // admin-created users are pre-verified via AdminCreateUser's UserAttributes
      standardAttributes: {
        email: { required: true, mutable: true },
      },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true,
        tempPasswordValidity: cdk.Duration.days(7),
      },
      mfa: cognito.Mfa.OFF,
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      lambdaTriggers: {
        userMigration: this.migrationFunction,
        postAuthentication: this.postAuthFunction,
      },
      removalPolicy: cdk.RemovalPolicy.RETAIN, // never accidentally delete the user directory
    })

    const commonClientProps: Partial<cognito.UserPoolClientProps> = {
      authFlows: {
        userPassword: true,
        adminUserPassword: true, // needed for update-my-profile's server-side "verify current password" check (Phase F)
        custom: false,
        userSrp: false,
      },
      refreshTokenValidity: cdk.Duration.days(30),
      accessTokenValidity: cdk.Duration.hours(1),
      idTokenValidity: cdk.Duration.hours(1),
      generateSecret: false, // both a Next.js server context and a React Native app need this — a secret can't be kept safely in RN
    }

    this.webClient = this.userPool.addClient('WebClient', {
      userPoolClientName: 'emr-portal-web',
      ...commonClientProps,
    })

    this.mobileClient = this.userPool.addClient('MobileClient', {
      userPoolClientName: 'emr-portal-mobile',
      ...commonClientProps,
    })

    new cdk.CfnOutput(this, 'UserPoolId', { value: this.userPool.userPoolId })
    new cdk.CfnOutput(this, 'WebClientId', { value: this.webClient.userPoolClientId })
    new cdk.CfnOutput(this, 'MobileClientId', { value: this.mobileClient.userPoolClientId })
  }
}
