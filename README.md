This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy

This app runs on AWS ECS Fargate behind an Application Load Balancer, defined as
AWS CDK (TypeScript) in `infra/`. Pushing to `main` triggers an AWS CodeBuild
pipeline (`buildspec.yml`) that builds the Docker image, pushes it to ECR, and
rolls out a new ECS task revision.

- `infra/` — CDK stacks: VPC/ECR/cluster (`foundation-stack.ts`), CI/CD
  (`codebuild-stack.ts`), ECS service + ALB (`service-stack.ts`), and the
  EventBridge+Lambda daily-reminders cron trigger (`cron-stack.ts`).
- `Dockerfile` — multi-stage build using Next.js's `output: 'standalone'` mode.
- To deploy infra changes: `cd infra && npx cdk deploy <StackName>`.
