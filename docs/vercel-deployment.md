# Vercel deployment for Lingorain

This is the canonical hosting direction for the current project: **Next.js on Vercel + PostgreSQL on Neon**. The older Netlify and fixed-Singapore notes elsewhere in this folder are historical planning material; do not treat them as the current deployment instructions.

Use the root-level `DEPLOYMENT.md` as the complete, authoritative procedure. It covers GitHub import, pooled/direct Neon connection strings, all SQL migrations through `0015`, environment validation, administrator bootstrap, provider integrations, external scheduled jobs and the later staging release gate.

## Current deployment decisions

- Vercel hosts the Next.js App Router, server actions, API routes and static assets. This is not a static export.
- Neon PostgreSQL stores account, wallet, purchase, reservation, lesson, classroom and audit data.
- Runtime `DATABASE_URL` should use Neon's pooled endpoint. `DATABASE_DIRECT_URL` is used only by controlled migration and administration commands.
- Do not hard-code a Vercel function region in `vercel.json`; select a region after choosing the Neon region and considering actual user geography/latency.
- The build preflight checks hosted environment variables. It does not apply migrations or create a production admin.
- The repository keeps only daily Vercel Cron for recording cleanup. Minute-level reminders and five-minute settlement/retry require a separately configured scheduler unless the selected Vercel plan supports the necessary cadence.
- Video, email, payments and private storage are external services and must be configured independently. Vercel deployment does not provision those provider accounts.

## Before importing into Vercel

1. Extract the latest source ZIP and keep `.env` and all provider credentials out of Git. Only `.env.example` belongs in the repository.
2. Create a private Git repository and push the source.
3. Create/select the Neon project and separate pooled and direct connection strings.
4. Follow `DEPLOYMENT.md` exactly. Back up an existing database and use a staging Neon branch before applying migration files.
5. Configure required secrets in the correct Vercel environment, then deploy only after the schema and admin bootstrap are complete.

## Release status

The current source has not been built, tested against a live Neon branch, pushed to GitHub or deployed to Vercel in this delivery. See `RELEASE_STATUS.md` and `LINGORAIN_SOURCE_COMPLETION.md` for the deliberate remaining verification steps.
