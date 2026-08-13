import * as cdk from 'aws-cdk-lib/core'
import * as events from 'aws-cdk-lib/aws-events'
import * as targets from 'aws-cdk-lib/aws-events-targets'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager'
import { Construct } from 'constructs'

interface CronStackProps extends cdk.StackProps {
  albDnsName: string
}

// Replaces vercel.json's Vercel Cron trigger (`30 0 * * *` daily) for
// app/api/cron/daily-reminders — that route's own auth check is unchanged
// (Authorization: Bearer CRON_SECRET), only the thing calling it moves to AWS.
//
// EventBridge's native "API destination" target requires HTTPS, which the ALB
// doesn't have yet (no custom domain/ACM cert — see the migration plan's Phase 6).
// A small Lambda as the target sidesteps that entirely: it just makes its own HTTP
// GET, no such restriction applies to a Lambda's outbound calls. CRON_SECRET is
// fetched from Secrets Manager at invoke time via the AWS SDK v3 (bundled in the
// managed Node.js 20.x Lambda runtime) rather than passed as a plaintext environment
// variable — avoids the secret ever appearing in a CloudFormation template or CDK
// deploy output.
export class CronStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: CronStackProps) {
    super(scope, id, props)

    const cronSecret = secretsmanager.Secret.fromSecretNameV2(this, 'CronSecretRef', 'emr-portal/CRON_SECRET')

    const fn = new lambda.Function(this, 'TriggerFunction', {
      functionName: 'emr-portal-daily-reminders-trigger',
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      timeout: cdk.Duration.seconds(30),
      environment: {
        TARGET_URL: `http://${props.albDnsName}/api/cron/daily-reminders`,
        CRON_SECRET_ARN: cronSecret.secretArn,
      },
      code: lambda.Code.fromInline(`
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const sm = new SecretsManagerClient({});

exports.handler = async () => {
  const secret = await sm.send(new GetSecretValueCommand({ SecretId: process.env.CRON_SECRET_ARN }));
  const res = await fetch(process.env.TARGET_URL, {
    headers: { Authorization: \`Bearer \${secret.SecretString}\` },
  });
  const body = await res.text();
  console.log('daily-reminders response:', res.status, body);
  if (!res.ok) throw new Error(\`daily-reminders returned \${res.status}: \${body}\`);
  return { status: res.status, body };
};
      `),
    })

    cronSecret.grantRead(fn)

    new events.Rule(this, 'DailyRemindersSchedule', {
      // Same schedule as the old vercel.json cron entry (30 0 * * * = 00:30 UTC daily).
      schedule: events.Schedule.expression('cron(30 0 * * ? *)'),
      targets: [new targets.LambdaFunction(fn)],
    })
  }
}
