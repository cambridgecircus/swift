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

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
# swift

## GEO x AI Daily Brief

The dashboard generates the GEO x AI Daily Brief from recent Gmail messages under:

`Daily Career Intel Digest for ChatGPT`

Required Vercel environment variables:

- `DEEPSEEK_API_KEY`
- `GMAIL_USER`
- `GMAIL_APP_PASSWORD`
- `GMAIL_LABEL_NAME=Daily Career Intel Digest for ChatGPT`
- `CRON_SECRET`

Optional environment variables:

- `DEEPSEEK_BASE_URL` if using a custom DeepSeek-compatible base URL
- `AI_PROVIDER=deepseek`
- `AI_MODEL`
- `AI_BASE_URL`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

When Supabase is configured, briefs are saved to the existing `swift_runs` storage pattern. Without Supabase, the refresh endpoint still returns the generated brief directly.
