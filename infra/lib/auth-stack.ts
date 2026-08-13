import * as cdk from 'aws-cdk-lib/core'
import * as cognito from 'aws-cdk-lib/aws-cognito'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import { Construct } from 'constructs'

// Replaces Supabase Auth. Foundational — no app code depends on this yet (that's
// Phases D/E of the Supabase migration plan). Deliberately does NOT mirror
// profiles.must_change_password into a custom Cognito attribute — Cognito's own
// UserStatus (FORCE_CHANGE_PASSWORD vs CONFIRMED) is read only at the login-challenge
// moment, profiles.must_change_password stays the single source of truth everywhere
// else in the app, same as today.
export class AuthStack extends cdk.Stack {
  public readonly userPool: cognito.UserPool
  public readonly webClient: cognito.UserPoolClient
  public readonly mobileClient: cognito.UserPoolClient
  public readonly migrationFunction: lambda.Function

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props)

    // Stub now, real bcrypt-against-Supabase logic lands in Phase G once the
    // direct-Postgres-connection spike confirms the approach. Must NOT be VPC-attached
    // — this repo's VPC has no NAT Gateway, and attaching a Lambda to a
    // public-subnets-only VPC removes its default internet route entirely.
    this.migrationFunction = new lambda.Function(this, 'MigrationFunction', {
      functionName: 'emr-portal-user-migration',
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      timeout: cdk.Duration.seconds(10),
      code: lambda.Code.fromInline(`
exports.handler = async (event) => {
  console.log('UserMigration trigger stub invoked, triggerSource:', event.triggerSource);
  // Phase G fills this in: verify event.request.password against the user's existing
  // Supabase bcrypt hash, then set event.response.userAttributes / finalUserStatus /
  // messageAction so Cognito creates a matching user transparently.
  throw new Error('User migration not yet implemented (Phase G)');
};
      `),
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
