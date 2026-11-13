# Push to GitHub and deploy on Vercel

This project is already a git repository with one clean commit. `.env` is ignored, `src/assets/home/` is committed, and the original `drizzle/` migrations, `vercel.json`, `.gitignore` and `.env.example` are included.

## Option A — push this exact project to a new repository

Download/export the project folder from this sandbox to your computer, open a terminal in the project root, then:

```bash
# 1. Check what will be sent (must NOT list .env or node_modules)
git status
git ls-files | grep -c .env      # should print only .env.example

# 2. Create an empty repository on github.com (no README, no .gitignore), then:
git remote add origin https://github.com/YOUR-USERNAME/lingorain.git
git branch -M main
git push -u origin main
```

When git asks for a password, use a **Personal Access Token**, not your GitHub password:

1. GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic) → Generate new token.
2. Scope: `repo` (and `workflow` if you later add Actions).
3. Copy the token once and paste it as the password.

Or with the GitHub CLI:

```bash
gh auth login
gh repo create lingorain --private --source=. --remote=origin --push
```

## Option B — fix your existing repository `farshadfarpouya0-eng/lingoo`

The original repository does not contain `src/assets/home/`, which is why the build fails there. From your local clone:

```bash
# 1. The homepage artwork that home-assets.ts imports
mkdir -p src/assets/home
cp public/images/*.webp src/assets/home/
git add -f src/assets/home

# 2. Deployment files (skip any that already exist)
git checkout -b fix/vercel-build
cp /path/to/this/project/.gitignore .
cp /path/to/this/project/.env.example .
cp /path/to/this/project/vercel.json .
cp -r /path/to/this/project/drizzle .
cp -r /path/to/this/project/scripts .

# 3. Commit and push
git add .gitignore .env.example vercel.json drizzle scripts
git status                      # confirm .env is NOT listed
git commit -m "Fix Vercel build: add homepage artwork, migrations and deployment scripts"
git push -u origin fix/vercel-build
```

Then open a pull request on GitHub and merge it into `main`.

Never run `git add -f .env`. If you already committed it, rotate every secret inside it.

## Option C — push straight from this sandbox

```bash
cd /app
git remote add origin https://YOUR-TOKEN@github.com/YOUR-USERNAME/lingorain.git
git push -u origin main
```

The token must have `repo` scope. After pushing, remove the remote so the token is not stored in git config:

```bash
git remote remove origin
```

## Configure Vercel

1. Vercel → Add New → Project → import the repository.
2. Framework preset: **Next.js**. Root directory: the repository root.
3. Settings → Environment Variables (Production **and** Preview). Generate each secret separately with
   `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | Neon **pooled** connection string (`-pooler` host, with `?sslmode=require`) |
| `DATABASE_DIRECT_URL` | Neon **direct** connection string |
| `SESSION_SECRET` | 32+ random characters |
| `PAYOUT_ENCRYPTION_KEY` | separate 32+ random characters |
| `CRON_SECRET` | separate 32+ random characters |
| `REMINDER_CRON_SECRET` | separate 32+ random characters |
| `APP_URL` | `https://your-project.vercel.app` — HTTPS origin only, no path |

`vercel.json` runs `node scripts/check-vercel-env.mjs` before the build. If a variable is missing or invalid, the build stops with the exact variable name instead of a cryptic error.

4. Deploy.

## Prepare the hosted database once

Run from your local clone with the Neon **direct** connection:

```bash
npm ci
export DATABASE_URL="<neon-direct-url>"
export DATABASE_DIRECT_URL="$DATABASE_URL"
export ALLOW_PRODUCTION_MIGRATIONS=true
node scripts/run-migrations.mjs

export ADMIN_EMAIL="you@example.com"
export ADMIN_PASSWORD="<long-unique-password>"
npx tsx scripts/create-admin.ts
```

The migration runner records each applied file in `lingorain_schema_migrations`, so re-running is safe. Demo accounts (`admin@demo.com`) are **not** created on hosted databases; use the administrator you create above.

## After the first successful deploy

- Sign in at `/login` with your administrator account.
- Admin → Integrations: add Resend (email verification), Stripe, Supabase Storage, Daily/Jitsi and Pusher keys as needed.
- Registration stays locked until email verification works, because new accounts are created unverified.
- `vercel.json` schedules only the daily recordings cleanup. Run `/api/cron/lesson-settlement` and `/api/cron/lesson-reminders` from an external scheduler with the bearer secrets documented in the upstream `DEPLOYMENT.md`.

## Common push/deploy errors

| Message | Cause | Fix |
| --- | --- | --- |
| `Module not found: Can't resolve '@/assets/home/...'` | artwork not committed | `git add -f src/assets/home` then commit and push |
| `Error: DATABASE_URL is required` | variable missing at build time | add `DATABASE_URL` in Vercel for Production and Preview, then redeploy |
| `Vercel cannot access the sandbox's local PostgreSQL` | `DATABASE_URL` points to `localhost` | use the Neon pooled URL |
| `APP_URL must be the canonical HTTPS origin` | path or trailing text in `APP_URL` | use only `https://domain` |
| `refusing to modify a hosted database` | migration guard | set `ALLOW_PRODUCTION_MIGRATIONS=true` for the one-off migration run only |
| Build passes but login fails | demo accounts do not exist on hosted DB | run migrations + `scripts/create-admin.ts` |

## Commands to avoid

- `git add .env` or `git add -f .env` — leaks database credentials.
- `npm run db:push` against production — the numbered migrations in `drizzle/` are the supported path.
- Putting secrets in `NEXT_PUBLIC_*` variables — they are shipped to browsers.
