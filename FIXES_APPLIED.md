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
