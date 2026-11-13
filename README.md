# Lingorain

An exact copy of https://github.com/farshadfarpouya0-eng/lingoo at revision `691d602`.

All application source files under `src/`, all public assets, and the configuration files (`next.config.ts`, `tsconfig.json`, `postcss.config.mjs`, `eslint.config.mjs`, `drizzle.config.json`) are byte-identical to the original repository. This includes the complete admin panel (`src/app/admin`, `src/components/admin`, `src/components/AdminShell.tsx`) and every admin setting, action and integration page.

The only addition is `src/assets/home/`, which the original repository imports but does not commit. It contains exact copies of the same images from `public/images/`, so the project builds without changing any source file.

## Stack

Next.js App Router, React, PostgreSQL and Drizzle ORM. The database connection reads `DATABASE_URL` from `.env`.

## Local preview

The original startup code (`src/instrumentation.ts`) creates the schema and seeds the original demonstration data when running against a local PostgreSQL database.

Demonstration accounts (local database only, as defined by the original seed):

| Role | Email | Password |
| --- | --- | --- |
| Student | student@demo.com | demo1234 |
| Student | yuki@demo.com | demo1234 |
| Tutor | teacher@demo.com | demo1234 |
| Administrator | admin@demo.com | demo1234 |

## Vercel deployment

The upstream repository fails on Vercel for two independent reasons. Both were reproduced and confirmed on this project.

### 1. Missing homepage artwork (first build error)

`src/lib/home-assets.ts` imports 14 files from `src/assets/home/`, but that folder is not committed upstream, so `next build` stops with:

```
Module not found: Can't resolve '@/assets/home/feature-schedule.webp'
Module not found: Can't resolve '@/assets/home/hero-adults.webp'
...
```

The identical images are already present in the repository under `public/images/`, so no download is needed and no source file has to change. Commit them once, from the repository root:

```bash
mkdir -p src/assets/home
cp public/images/*.webp src/assets/home/
git add -f src/assets/home
git commit -m "Add the homepage artwork that home-assets.ts imports"
git push
```

`git add -f` is used in case an ignore rule covers the folder. The same files are already available in `src/assets/home/` of this project.

### 2. Missing `DATABASE_URL` (second build error)

With the artwork present, the build proceeds and then fails while collecting route configuration:

```
Error: Failed to collect configuration for /api/brand-logo
[cause]: Error: DATABASE_URL is required
```

`src/db/index.ts` throws on import when the variable is absent, so it must exist at **build** time, not only at runtime. Add it in Vercel → Project → Settings → Environment Variables for Production (and Preview):

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | Neon **pooled** PostgreSQL connection string (used by the app at runtime and build) |
| `DATABASE_DIRECT_URL` | Neon **direct** connection string, used only for one-off migration/admin commands |
| `SESSION_SECRET` | random secret, 32+ characters |
| `PAYOUT_ENCRYPTION_KEY` | separate random secret, 32+ characters |
| `APP_URL` | final HTTPS origin, e.g. `https://your-project.vercel.app` |
| `CRON_SECRET` / `REMINDER_CRON_SECRET` | separate random secrets, 32+ characters each |

Generate each secret independently:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3. Database schema and first administrator

Hosted databases never receive the local demo seed, so the demo accounts above do not exist on Vercel. Apply the schema and create a real administrator once, from a local clone using the Neon **direct** connection:

```bash
npm ci
export DATABASE_URL="<neon-direct-url>"
export DATABASE_DIRECT_URL="$DATABASE_URL"
export ALLOW_PRODUCTION_MIGRATIONS=true
npm run db:migrate

export ADMIN_EMAIL="you@example.com"
export ADMIN_PASSWORD="<long-unique-password>"
npx tsx scripts/create-admin.ts
```

Sign in at `/login` with that administrator, then complete `Admin → Integrations` (Resend for email verification, Stripe, Supabase Storage, Daily/Jitsi, Pusher) as described in the upstream `DEPLOYMENT.md`.

### 4. Runtime notes

- New sign-ups stay locked until email verification, so Resend and `APP_URL` must be configured before opening public registration.
- Payments, hosted uploads, video classrooms and crypto gateways require their provider credentials; nothing is simulated.
- `vercel.json` in the upstream repository keeps only the daily recordings cleanup cron; settlement and reminders need an external scheduler with the documented bearer secrets.

## Pushing to GitHub and Vercel

This folder is already a git repository with one clean commit: `.env` is ignored, the homepage artwork is committed, and the original `drizzle/` migrations, `scripts/`, `vercel.json`, `.gitignore` and `.env.example` are present.

See **[docs/PUSH_TO_GITHUB.md](docs/PUSH_TO_GITHUB.md)** for the exact push commands (new repository, fixing the existing upstream repository, or pushing from this sandbox), the required Vercel environment variables, the one-off Neon migration and administrator creation steps, and a table of common push/deploy errors.
