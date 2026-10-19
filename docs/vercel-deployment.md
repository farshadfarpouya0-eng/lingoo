# Lingorain on Vercel with Marketplace PostgreSQL

## Does Vercel itself have a database?

You can create and manage a PostgreSQL database from the Vercel dashboard through **Storage / Marketplace** integrations. The underlying database is supplied by a partner such as **Neon, Supabase or AWS Aurora**, not an independent Vercel PostgreSQL service.

According to Vercel's current official documentation, the old **Vercel Postgres** product is no longer available; existing resources were moved to Neon in December 2024. For a new Lingorain project use a Marketplace integration, rather than an old Vercel Postgres tutorial or package.

With the **Vercel-managed Neon integration**, database provisioning, connection variables and billing are handled through the Vercel dashboard. The database is still Neon. A Free database option, when offered in the integration's current plan picker, does not make compute unlimited or include all database use in the site's hosting fee. Check the selected database plan and Vercel hosting plan separately before confirming purchases.

Vercel Blob is file/object storage. It is suitable for media files, not a substitute for the transactional PostgreSQL tables used by Lingorain's wallets, packages and reservations.

## Recommended setup for this codebase

- Vercel handles Next.js, Server Actions, API routes and static assets.
- Install Neon through the Vercel Marketplace and create the database in **Singapore**.
- `vercel.json` selects Singapore function region **`sin1`**, keeping the app's transactional functions near the Neon Singapore database. Do not point those functions at a distant database just because the public CDN is global.
- Continue using the existing Drizzle + node-postgres client and its small pool. No runtime database rewrite is necessary.
- Video remains separate: Google Meet/Zoom are tutor-provided links; Lingo Room uses Jitsi. Deploying to Vercel does not provision a video media server.

## Import and connect

1. Import the Git source into Vercel as a **Next.js** project. Do not upload only `public/` or use static export.
2. Choose a Node.js version compatible with the project's Next.js version; Node 22 is used in the existing deployment guide.
3. In **Storage / Marketplace**, add Neon, choose region and plan, then **Connect Project** for the intended environments.
4. The native integration normally injects:
   - `DATABASE_URL`: pooled runtime connection.
   - `DATABASE_URL_UNPOOLED`: direct connection for schema/admin work.
5. Leave the integration's environment prefix unchanged or explicitly map the pooled URL to **`DATABASE_URL`**, which this application reads. Never copy the sandbox's local PostgreSQL URL.
6. Add a random stable `SESSION_SECRET` of at least 32 characters and a canonical HTTPS `APP_URL` for the deployment.
7. Set `ENABLE_DEMO_DATA=false` and `ENABLE_DEMO_PAYMENTS=false` for real users. Disabling these flags does not delete demo users already present in a copied database.
8. Set both Stripe secrets if enabling payments; otherwise the hosted site disables wallet top-ups. Use a separate test environment for provider tests.
9. Set `JITSI_DOMAIN` only if a separate video server has actually been provisioned, then redeploy so the iframe permissions policy matches.
10. For secure material and teacher-document uploads, set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_STORAGE_BUCKET` to a **private** bucket. Configure bucket CORS to allow your application origin and `PUT` requests.
11. For scheduled class reminders, set `RESEND_API_KEY`, a verified `RESEND_FROM`, `CRON_SECRET` (at least 32 random characters; Vercel Cron passes it as a Bearer header) and `APP_URL`. For a non-Vercel scheduler, use `REMINDER_CRON_SECRET` and configure its Authorization header. Set the private bucket max file size to 25 MiB or lower. Verify delivery in staging before relying on reminders.

The Vercel build preflight checks the configuration without printing secret values. It does **not** apply schema changes, create a Neon project, charge a card or deploy the app by itself.

## Apply schema and create an administrator

Use private tooling against the intended hosted database. Apply the checked-in SQL migrations from a private release environment. Set `DATABASE_DIRECT_URL` (or the direct `DATABASE_URL` connection), take a backup for an existing database, test first on staging, then run:

```sh
ALLOW_PRODUCTION_MIGRATIONS=true npm run db:migrate
npm exec --yes --package=tsx -- tsx scripts/check-database.ts
```

The migration runner records applied filenames and refuses hosted databases unless `ALLOW_PRODUCTION_MIGRATIONS=true` is explicitly set for that command. It is intentionally not part of the application build. Do not use `drizzle-kit push` against production or from each deployment build.

Privately set `ADMIN_EMAIL`, `ADMIN_NAME` (optional) and a new `ADMIN_PASSWORD` (at least 12 characters), then run:

```sh
npm exec --yes --package=tsx -- tsx scripts/create-admin.ts
```

Keep admin bootstrap passwords out of Vercel runtime/client environment variables. Never commit credentials to Git.

## Previews, billing and commercial launch

- Neon integration preview branching can isolate preview data. Confirm it is enabled and that each deployment receives the correct branch credentials. Never expose a real wallet database to untrusted preview code.
- `APP_URL` must match the intended environment; a production origin is not automatically the right preview origin.
- The current Neon Free plan may suspend compute after inactivity and has usage limits. A paid plan can remove database idle suspension where supported, but does not guarantee total page latency.
- **Vercel Hobby is restricted to personal, non-commercial use.** An actual paid English-tutoring business should use an appropriate commercial Vercel plan, typically Pro, even if its connected database starts on Neon Free.
- Marketplace storage billing and hosting billing are distinct products even when managed in one dashboard. Verify current plan terms and spending controls before upgrading.
- Measure latency and reachability from real China/Japan networks. Region selection and a CDN do not guarantee mainland-China access.

## Verify after deployment

- Check `/api/health`, plus the schema checker above. A successful DB ping alone does not certify all tables or a payment integration.
- Create real teacher/student accounts; test packages, credit booking, refunds and tutor-selected platform switching.
- Ensure known-password demo credentials are not displayed and old demo data is not used for real money.
- Verify signed Stripe webhooks on the Vercel domain before live payments.
- Existing operational needs remain: shared rate limiting for multiple instances, scheduled settlement, backups, monitoring, account recovery and real payout processing.
- Netlify configuration remains present; choosing Vercel does not move existing data automatically or prove the app is already deployed on your Vercel account.

## Official references

- Postgres on Vercel: https://vercel.com/docs/postgres
- Marketplace storage: https://vercel.com/docs/marketplace-storage
- Neon Vercel-managed integration: https://neon.com/docs/guides/vercel-managed-integration
- Function regions: https://vercel.com/docs/functions/configuring-functions/region
- Vercel Hobby terms: https://vercel.com/docs/plans/hobby
