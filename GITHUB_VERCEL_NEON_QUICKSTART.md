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
4. Import the GitHub repository in Vercel. Add `DATABASE_URL`, `DATABASE_DIRECT_URL`, `SESSION_SECRET`, `INTEGRATION_ENCRYPTION_KEY`, `APP_URL`, and `CRON_SECRET` in Production. Add a separate Neon branch and separate variables for Preview.
5. Apply `drizzle/*.sql` migrations from a controlled terminal against a backed-up/staging Neon branch first. Use `npm ci`, then set `DATABASE_URL` to the Neon direct connection, set `DATABASE_DIRECT_URL` to the same value and `ALLOW_PRODUCTION_MIGRATIONS=true`, then run `npm run db:migrate`. Never run `db:push` against production.
6. Create the admin privately with `scripts/create-admin.ts`, then deploy from Vercel.
7. Configure Resend, Supabase Storage, Stripe, Daily and optionally Pusher/Upstash under **Admin → Integrations**. Reminder emails need a scheduler that calls `/api/cron/lesson-reminders` every minute with `Authorization: Bearer <REMINDER_CRON_SECRET>`. Vercel Hobby allows daily Cron only; use an external scheduler for minute-level reminders on that plan, or Vercel Pro/Enterprise Cron.

See [`DEPLOYMENT.md`](./DEPLOYMENT.md) for the full guide and caveats. The project should not be considered production-ready until typecheck, lint, build, migrations and provider E2E tests pass on staging.
