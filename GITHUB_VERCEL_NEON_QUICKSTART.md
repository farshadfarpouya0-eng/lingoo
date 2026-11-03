# Quick start: GitHub → Neon → Vercel

1. Extract the project ZIP locally. Keep `.env` and provider secrets out of Git.
2. Create an empty **private** GitHub repository, then from the project directory run:

   ```powershell
   git init
   git add .
   git status
   git commit -m "Prepare Lingorain for deployment"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/lingorain.git
   git push -u origin main
   ```

3. In Neon, copy both connection strings: pooled → `DATABASE_URL`; direct → `DATABASE_DIRECT_URL`.
4. Import the GitHub repository in Vercel. Add `DATABASE_URL`, `DATABASE_DIRECT_URL`, `SESSION_SECRET`, `PAYOUT_ENCRYPTION_KEY`, `APP_URL`, `CRON_SECRET`, and `REMINDER_CRON_SECRET` in Production. Generate the payout and scheduler secrets independently with `openssl rand -base64 48`. `INTEGRATION_ENCRYPTION_KEY` is optional on new installs; do not change it on an existing database without migrating previously encrypted provider credentials. Add a separate Neon branch and separate variables for Preview.
5. Apply `drizzle/*.sql` migrations from a controlled terminal against a backed-up/staging Neon branch first. Use `npm ci`, then set `DATABASE_URL` to the Neon direct connection, set `DATABASE_DIRECT_URL` to the same value and `ALLOW_PRODUCTION_MIGRATIONS=true`, then run `npm run db:migrate`. Never run `db:push` against production.
6. Create the admin privately with `scripts/create-admin.ts`, then deploy from Vercel.
7. Configure Resend, Supabase Storage, Stripe, Daily, optional Pusher/Upstash, and optional crypto payments under **Admin → Integrations**. For crypto, see `CRYPTO_PAYMENTS_RELEASE_2026-11-03.md`; do not enable live processing until credentials, webhook signature delivery, migration `0017`, legal/KYB eligibility and end-to-end tests are confirmed. Configure an external scheduler for `/api/cron/lesson-settlement` and `/api/cron/recordings-cleanup` every 5 minutes with `CRON_SECRET`, and `/api/cron/lesson-reminders` every minute with `REMINDER_CRON_SECRET`. The Vercel-native cron is kept to daily recording cleanup so this configuration is compatible with Hobby and Pro. After backup and all migrations through `0016_timezone_safe_lesson_instants.sql`, run `npm run db:encrypt-payout-data` (dry-run), then `npm run db:encrypt-payout-data -- --apply` to encrypt old payout account values.

See [`DEPLOYMENT.md`](./DEPLOYMENT.md) for the full guide and caveats. The project should not be considered production-ready until typecheck, lint, build, migrations and provider E2E tests pass on staging.
