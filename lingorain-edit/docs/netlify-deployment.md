# Deploy Lingorain to Netlify

## Is the database the only remaining requirement?

No. Distinguish an initial online deployment from a live commercial release:

| Stage | Required work |
| --- | --- |
| Initial Netlify deployment | Import the source repository; connect hosted PostgreSQL; apply and verify the schema; configure `DATABASE_URL`, a stable `SESSION_SECRET`, and the canonical HTTPS `APP_URL`; disable demo accounts/payments and create a private administrator. |
| Accept real money | Activate the payment provider, configure signed webhooks, test real checkout/refunds, and define/implement real tutor payout processing. Dashboard wallet accounting does not itself transfer money to a bank. |
| Run a dedicated video service | Provision a separate video server/provider and configure `JITSI_DOMAIN`; test media access and reliability. Netlify serves the classroom interface, not Jitsi media servers. Tutor-provided Google Meet/Zoom links remain the other options. |
| Public multi-instance operation | Add shared rate limiting, scheduled settlement independent of dashboard visits, monitoring, backups, account recovery/verification, and test access from China/Japan. |

The source and configuration files can be build-ready while these external services are still unconfigured. A successful local preview is not evidence of a completed Netlify deployment or a commercially ready launch.

After applying the intended hosted schema, verify the application's runtime database with this read-only command:

```sh
npm exec --yes --package=tsx -- tsx scripts/check-database.ts
```

It checks the connection, every expected table/column, and the unique lesson-slot index using Drizzle. It does not create/reset tables or print credentials. Run it with the actual runtime `DATABASE_URL`, not only the administrative direct URL.

## Recommended topology

- **Netlify + its auto-updated OpenNext adapter**: Next.js App Router, SSR pages, API routes, Server Actions and static assets.
- **Hosted PostgreSQL (recommended: Neon)**: users, sessions, messages, wallets, purchases and reservations. Use the pooled connection for application traffic and the direct connection for schema/admin work.
- **Separate Jitsi/video infrastructure**: Netlify hosts the website, not the audio/video media servers. Google Meet and Zoom continue to work through tutor-provided meeting links.

Do **not** drag-and-drop `public/`, `out/` or a bare `.next` folder into Netlify Drop. This application is not a static site. Do not configure `output: 'export'`, `next export`, or a catch-all redirect to `index.html`. Deploy the source from a Git repository so Netlify builds the serverless app.

## 1. Create the database

**Neon does not have to be paid to run this app.** Its Free plan can be used for testing or a low-traffic pilot within the provider's resource allowances. The paid plan recommended in the speed-first section is optional: it allows disabling database idle suspension for more predictable first-query latency. Paid usage is metered, and an always-active compute costs more than a mostly-idle one. Monitor limits and check the current official pricing at https://neon.com/pricing; Netlify and video hosting are billed separately.

1. Create a PostgreSQL database in Neon (or another compatible provider).
2. Choose a region near the Netlify Functions region. Check actual latency from your users in China and Japan; CDN hosting alone does not guarantee mainland-China reachability.
3. Copy the **pooled** PostgreSQL connection string with the provider's TLS parameters into `DATABASE_URL`.
4. Keep the **direct**, nonpooled connection separately in `DATABASE_DIRECT_URL` for applying the schema. It is not needed by the application at runtime.
5. Do not copy the sandbox's `127.0.0.1` URL into Netlify. No local PostgreSQL server is present in a Netlify Function.

Netlify deploys do not reset an external PostgreSQL database. Purchase/session persistence comes from the database, not from files in the build output.

## 2. Initialise the schema deliberately

Use a private workstation/CI environment with `.env` or real environment variables set. Never put credentials in Git.

Use the checked-in SQL migration runner from a private release environment. Set `DATABASE_DIRECT_URL` (or a direct `DATABASE_URL`), back up any existing database, test the changes in staging, then run:

```sh
ALLOW_PRODUCTION_MIGRATIONS=true npm run db:migrate
npm exec --yes --package=tsx -- tsx scripts/check-database.ts
```

The migration runner records applied migration filenames and refuses hosted databases unless the release command explicitly opts in. The Netlify build intentionally does **not** mutate the schema, so deploy previews cannot change production tables. Do not run `drizzle-kit push` on production or during every build.

## 3. Create your real administrator

Keep `ENABLE_DEMO_DATA=false` and `ENABLE_DEMO_PAYMENTS=false` on a live site. Configure `ADMIN_EMAIL`, `ADMIN_NAME` (optional) and a unique `ADMIN_PASSWORD` of 12–200 characters privately, then run:

```sh
npm exec --yes --package=tsx -- tsx scripts/create-admin.ts
```

The script creates an admin, does not print passwords, and will not promote a student/tutor account. Remove the admin-setup credentials from that private environment afterwards. They are not needed by Netlify Functions.

If copying the existing demo DB rather than starting fresh, explicitly remove/disable the known-password demo accounts and simulated financial records. Disabling the demo flag does not delete pre-existing demo users or funds.

## 4. Import the Git repository in Netlify

Push the source, including `netlify.toml`, `package-lock.json`, `src/` and `public/`. `.gitignore` excludes secrets, generated build artifacts and test screenshots.

In Netlify: **Add new project → Import an existing project → select the Git repository**. If labels differ, choose the Git-based import flow rather than a static-file upload.

Settings in `netlify.toml`:

| Setting | Value |
| --- | --- |
| Base directory | Repository root |
| Build command | `node scripts/check-netlify-env.mjs && npm run build` |
| Publish directory | `.next` |
| Node version | `22` |
| Next adapter | Automatic OpenNext adapter (no old pinned plugin) |
| Skew protection | Enabled |

The preflight rejects a local DB URL, missing/short classroom secret, invalid public origin or partial Stripe configuration. It never prints secret values. Checking environment variables does not prove network or schema connectivity; verify health after deployment.

## 5. Configure environment variables

Set variables in Netlify **Project configuration → Environment variables** (or equivalent). Include both **Builds** and **Functions** scopes for runtime values when scope controls are available. Values in `netlify.toml` are build-time settings and should not be used to store runtime secrets.

| Variable | Required? | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Yes | Hosted pooled PostgreSQL URL with TLS |
| `SESSION_SECRET` | Yes | Stable random secret of at least 32 characters; generate a new value, do not reuse the DB password |
| `APP_URL` | Yes | Canonical HTTPS origin, e.g. your allocated `https://your-project.netlify.app`, no path/query |
| `ENABLE_DEMO_DATA` | Set `false` | Prevents automatic known-password demo accounts |
| `ENABLE_DEMO_PAYMENTS` | Set `false` | Prevents simulated free wallet credit |
| `DB_POOL_MAX` | Optional, default `2` | Small pool per warm serverless instance |
| `DB_CONNECT_TIMEOUT_MS` | Optional, default `15000` | Database connection timeout |
| `STRIPE_SECRET_KEY` | Optional | Real payment provider key; use test mode until verified |
| `STRIPE_WEBHOOK_SECRET` | Required with Stripe | Validates wallet-credit webhooks |
| `JITSI_DOMAIN` | Optional, recommended for real classes | Video server hostname only, without `https://` or paths |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | For private uploads | Server-only credentials; bucket must remain private |
| `SUPABASE_STORAGE_BUCKET` | Optional | Defaults to `lingorain-private` |
| `RESEND_API_KEY`, `RESEND_FROM`, `REMINDER_CRON_SECRET` | For reminders on a custom scheduler | Verified sender and long random secret; the scheduler must send an Authorization: Bearer header. Configure an external scheduler because Vercel-style `vercel.json` cron is not used by Netlify. |

Generate the classroom secret privately, for example with:

```sh
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Do not prefix server secrets with `NEXT_PUBLIC_`. Do not commit a filled-in `.env`. Redeploy after changing build-time variables, especially `JITSI_DOMAIN`, because the iframe security policy is generated at build time.

Use a separate database/branch and separate provider credentials for Deploy Previews. Never point untrusted pull-request builds at real user wallet data. The canonical production `APP_URL` is not automatically the correct URL for a preview.

## 6. Payments and classes

- No Stripe credentials: on a hosted database, real-site top-ups are disabled by default. The UI says payments are not configured rather than crediting pretend money.
- Stripe enabled: configure the webhook at `${APP_URL}/api/stripe/webhook`, subscribed to `checkout.session.completed`. Test card checkout and webhook replay protection before accepting money.
- Google Meet/Zoom: the tutor supplies the valid meeting URL for each class. Netlify does not generate or host those meetings.
- Lingo Room: the website UI works on Netlify; the video room runs on public Jitsi by default or your `JITSI_DOMAIN` host. A media server is **not** provisioned by a Netlify deployment. Real meetings/provider admission and network reachability must be tested independently.

## 7. Post-deployment checks

- Open `/api/health`: expect `{ "ok": true }` (checks a DB query; does not certify the full schema/payment setup).
- Open `/`, `/teachers`, `/login` and `/register`; create real student/tutor accounts.
- Confirm no demo credentials are shown in a public login page.
- Verify sessions survive a navigation/deploy and you cannot access another user's classroom API.
- Test package purchase, 25/50-minute reservations, credit cancellation, and teacher-selected live classroom switching.
- Test Stripe in test mode with signed webhooks; real money launch requires provider/legal setup.
- Check Netlify Function logs and actual DB limits. Never output credentials to logs.

## Remaining production operations

Deployment readiness is not a security audit or a guarantee that all scale/network requirements are solved:

- The current request limiter is process-local. Use a shared, persistent limiter (e.g. Redis/database or provider rules) before high-traffic public operation across multiple serverless instances.
- Lesson settlement currently runs when dashboards load. For guaranteed off-hours settlement, add a protected scheduler/cron workflow; the platform should not depend on an active user visiting a page.
- Four-second classroom polling creates function/DB traffic. Evaluate Netlify quotas and costs at the expected class concurrency.
- Backups, alerts, email verification/password recovery, real payout processing, financial/legal requirements and media-server monitoring need an operational release checklist.
- Check mainland-China accessibility separately. Google services and hosting/network paths may not be reachable for every learner there.
- Replace demo marketing counts/testimonials with real data before commercial launch.

## Speed-first deployment

For Lingorain’s China/Japan audience, the recommended starting configuration is **Netlify Pro functions in Singapore (`sin`) + paid Neon PostgreSQL in Singapore (`aws-ap-southeast-1`)**, with video infrastructure separate. Select the Functions Region in Netlify’s project UI and redeploy; the default region may otherwise remain Ohio. Disable Neon Scale to zero for the production compute if predictable first-request database latency is more important than idle cost.

See `docs/performance-plan.md` for the image, cache, query and classroom-poll optimisations already implemented. This configuration reduces avoidable backend distance and DB wake-up latency; it is not a guarantee of page speed or mainland-China network access. Verify from real user networks before commercial launch.

## Official references

- Netlify Next.js support: https://docs.netlify.com/build/frameworks/framework-setup-guides/nextjs/overview/
- Netlify build/runtime variables: https://docs.netlify.com/build/configure-builds/environment-variables/
- Neon serverless connection pooling: https://neon.com/docs/guides/serverless-connection-pooling
