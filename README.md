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

The Dashboard tab generates the GEO x AI Daily Brief from Google Alert emails in Gmail label:

`CareerIntel/Market`

The refresh and scheduled runs only process messages from `googlealerts-noreply@google.com`, extract the original alert links, fetch readable article content where possible, analyse the evidence with the configured AI provider, update the Dashboard, and send the HTML digest to `cambridgecircus@gmail.com` under Gmail label:

`Daily Career Intel Digest for ChatGPT`

Required Vercel environment variables:

- `DEEPSEEK_API_KEY`
- `DEEPSEEK_BASE_URL=https://api.deepseek.com`
- `DEEPSEEK_MODEL=deepseek-chat`
- `AI_PROVIDER=deepseek`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REFRESH_TOKEN`
- `GMAIL_USER=cambridgecircus@gmail.com`
- `GMAIL_MARKET_LABEL=CareerIntel/Market`
- `GMAIL_DIGEST_LABEL=Daily Career Intel Digest for ChatGPT`
- `GMAIL_DIGEST_TO=cambridgecircus@gmail.com`
- `CRON_SECRET`

Optional environment variables:

- `OPENAI_API_KEY` only if `AI_PROVIDER=openai`
- `OPENAI_MODEL=gpt-4.1-mini` only if `AI_PROVIDER=openai`
- `OPENAI_BASE_URL` only if using an OpenAI-compatible chat-completions base URL
- `GMAIL_APP_PASSWORD` for older non-Dashboard Gmail utilities that still use app-password auth
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Refresh validates the Gmail API profile before searching, then uses that same Gmail API credential to read alerts, send the digest, and apply the digest label. If `GOOGLE_REFRESH_TOKEN` belongs to any account other than `cambridgecircus@gmail.com`, the Dashboard debug box will stop the run and show the authenticated account that needs replacing. If the AI provider fails, SWIFT saves and emails a fallback GEO brief from Google Alert titles, snippets, and fetched article text.

### Generate a Gmail OAuth Refresh Token Locally

Use the local helper to generate a fresh `GOOGLE_REFRESH_TOKEN` for `cambridgecircus@gmail.com`. This token is printed in the terminal only; the script does not write it into `.env.local` or source code.

Before running it, make sure `.env.local` contains:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`

The Google OAuth client must allow this redirect URI:

`http://localhost:3005/oauth2callback`

Then run:

```bash
pnpm gmail:auth
```

The helper opens Google consent with offline access, consent prompt, and `login_hint=cambridgecircus@gmail.com`, using these scopes:

- `https://www.googleapis.com/auth/gmail.modify`
- `https://www.googleapis.com/auth/gmail.send`

After consent, it prints:

- `GOOGLE_REFRESH_TOKEN`
- authenticated Gmail account
- whether it equals `cambridgecircus@gmail.com`

Copy the printed token into your local `.env.local` and Vercel Production environment as `GOOGLE_REFRESH_TOKEN`. Keep `GMAIL_USER=cambridgecircus@gmail.com`. Do not commit `.env.local`.

When Supabase is configured, briefs are saved to the existing `swift_runs` storage pattern and scheduled duplicate emails are blocked by stored run history plus a Gmail-label subject check. Without Supabase, the refresh endpoint still returns the generated brief directly.

Vercel cron runs in UTC, and the Hobby plan must keep this to one daily run. `vercel.json` schedules `/api/daily-report` at `15 8 * * *` (08:15 UTC, 09:15 UK during British Summer Time) so the scheduled job runs after the usual Google Alert arrival window. The manual Dashboard Refresh brief button remains available anytime and uses the same GEO brief generator.
