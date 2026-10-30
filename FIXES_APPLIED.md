> **Historical note:** This file records earlier fixes only. Its old dependency-audit snapshot and issue list are not current verification results. For the current code state and open release gates, see `LINGORAIN_SOURCE_COMPLETION.md`, `SECURITY_REVIEW.md`, `RELEASE_STATUS.md`, and `DEPLOYMENT.md`.

# Fixes applied to this version

## Security / dependencies
- Next.js upgraded 16.3.8 -> 16.4.3 (fixes the critical RCE / DoS advisories). `package.json` now requires `^16.4.3`.
- `postcss` pinned to 8.5.31 (high-severity advisory). `npm audit --omit=dev` reports 0 vulnerabilities.
  Remaining audit items are dev-only (`drizzle-kit` -> `@esbuild-kit` -> `esbuild`).

## Build safety
- Removed `typescript.ignoreBuildErrors` from `next.config.ts` (type errors now fail the build, as intended).
- `src/db/index.ts`: `DATABASE_URL` is required again. The localhost fallback is only used when `NODE_ENV=development`.
- `.env.example` restored (plus `ENABLE_ADMIN_IMPERSONATION`).
- `scripts/hosted-env.mjs` warns when `ENABLE_ADMIN_IMPERSONATION=true` on a hosted deployment.
- Removed the stray `.backup/` folder (already listed in `.gitignore`).

## Database
- New migration `0007_drop_reviews_lesson_unique.sql`. Migration 0003 was edited after some databases had already
  applied it; the migration runner records applied files by name, so the extra DROP in 0003 would never run there.
  0007 repeats it idempotently. Run `npm run db:migrate` before deploying this version.

## ESLint (13 errors -> 0)
- Escaped apostrophes in 4 JSX texts.
- `Date.now()` in render code now goes through `nowMs()` (`src/lib/time.ts`).
- `InteractiveCourseReader`: no synchronous `setState` in an effect; playing state resets on `loadstart`.
- `ReferralPanel`: origin is read with `useSyncExternalStore` instead of `setState` in an effect.
- `MobileMenu`: internal anchors use `next/link`.

## Admin → Integrations: storage settings were not being saved
Root cause: in the preview/sandbox environment (E2B + local Postgres) the database is created by
`src/db/preview-bootstrap.ts` from a hand-written list of 12 tables. `site_settings` (where integration
settings are stored) and every other table added later were never created, so saving failed.
- `preview-bootstrap.ts` now creates **every** table exported from `schema.ts`, in foreign-key order
  (28 tables / 231 columns, verified against a fresh database).
- Saving no longer reads with a swallowed error: if the read fails the save stops instead of overwriting every
  saved provider with an empty config.
- Values that are too long are rejected with a message instead of being silently truncated
  (a cut-off service-role key "saved" fine and then failed every request).
- Storage URL must be `supabase.co` or `*.supabase.co` (it used to accept any host ending in "supabase.co").
- Save / test results are now shown **inside the card you used** and the page jumps to it
  (before, the message appeared only at the top of a very long page).
- Database errors are replaced by a readable message; SQL text and parameters are no longer put in the URL.
- Clearer messages for a bad URL and bad bucket name.

## Admin: tutors could never be activated, and students/tutors were mostly read-only
Root cause: `/admin/tutors` linked to `?edit=ID` but never rendered `TeacherEditForm`, so the only "Active/Public"
checkbox was unreachable. New tutors are created hidden (`active = false`); verifying their ID only sets the
"certified" badge, it never activates them. `adminSetTeacherApproval` existed but nothing called it.
- **Admin → Tutors**: new one-click **Activate / Hide** button on every row, a "waiting for approval" banner,
  filter tabs (All / Waiting for approval / Active), and an ID-document badge (verified / waiting / rejected / none).
  Waiting tutors are listed first. "Add tutor" has an "Activate immediately" checkbox.
- **Edit tutor** (the Edit button now works): name, email, photo, native language, headline, bio, price, rating,
  reviews, lessons taught, country, accent, languages, topics, working hours/days/timezone, payout method/account,
  Active, Certified, Suspended. Shows Saved / error messages (duplicate email, bad photo link, ...).
- **Edit student**: name, email, level, native language, photo, Suspended (previously everything was read-only
  except the balance). Balance adjustment and delete are still there.
- Suspension can now be set from these forms (before, only moderation cases could do it).
- Deleting a tutor/student who still has lessons or payments is refused with a clear message. Before, deleting a
  tutor removed the profile first and then failed, leaving a half-deleted tutor.
- The "Add tutor" form no longer shows an error message before you type anything.
- The tutor dashboard banner now says the truth: profiles go live when an admin approves them.
- Editors only touch the matching role (the student editor cannot change a tutor and vice versa); admin accounts
  cannot be edited there; all of it requires an admin session.


## Follow-up fixes — 2026-10-28
- Dashboard lesson cards now format each lesson in the teacher's configured UTC offset, matching the teacher timetable instead of formatting all English-language users in UTC+8.
- Rebuilt the textbook/audio upload flow: files upload directly to private Supabase Storage via signed upload tickets; Neon stores lesson text and private storage references rather than base64 audio. Added protected per-material asset streaming with purchase checks and byte-range support.
- Fixed the material creation contract: the server now accepts the interactive-course JSON payload, validates each private asset, and supports free/paid material pricing in USD. Added the missing `isFree` checkbox and updated the cover-image preview paths.
- Updated Content Security Policy `connect-src` for signed uploads to Supabase Storage. The configured Supabase bucket still needs to allow the deployed origin in its CORS settings.
- Fixed admin sandbox classroom access: test lessons can be opened by an admin for room checks; admin room access and Daily test tokens are restricted to `[TEST]` lessons. Added `/admin/rooms` as a redirect alias to `/admin/testing`.
- Password reset inputs in the admin account UI are masked.
- Verification: TypeScript/TSX transpile syntax check passed for 144 source/config files. Full typecheck, lint, production build and live DB/provider tests remain unverified because npm dependency installation could not complete in this environment.
