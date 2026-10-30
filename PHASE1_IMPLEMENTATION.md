# Lingorain — Phase 1 implementation report

**Date:** 2026-10-30  
**Base archive:** `lingorain-accounting-fix.zip`  
**Status:** Code changes made in the working copy. Live database and hosting are unchanged.

## Implemented in this phase

### 1. Semi-private pending lesson refunds
- `src/lib/money.ts`: the settlement path locks the lesson row before inspecting seats.
- Pending semi-private lessons refund every active `booked`/`attended` participant seat, not only `lessons.studentId`.
- Each refund uses an idempotency reference `group-refund:<lessonId>:<studentId>` before the wallet is credited.
- Participant rows transition to `refunded` in the same transaction. A legacy no-seat fallback remains for old rows.
- Admin cancellation uses the same per-seat idempotent refund helper.

### 2. Payout-account protection
- `src/lib/payout-crypto.ts`: AES-256-GCM envelope with a fresh IV per encryption, version prefix `p1`, decrypt compatibility for legacy plaintext rows, and UI masking.
- `src/lib/actions.ts` and `src/lib/admin-actions.ts`: new payout account values are encrypted before persistence; teachers may submit an empty account field to reuse the saved account.
- Admin payout pages display only the last four characters. Full reveal is an explicit action, rate-limited, restricted to pending payouts, and logged in `payout_account_access_logs`.
- Teacher dashboard and admin teacher editor no longer serialize or prefill the stored account value.
- Added migrations `drizzle/0010_payout_data_protection.sql` and `drizzle/0011_recording_retry_claims.sql`, plus `scripts/encrypt-payout-data.mjs`. The script defaults to dry-run; `--apply` encrypts legacy database values without printing them.
- Hosted environment validation now requires `PAYOUT_ENCRYPTION_KEY` (32+ characters) and separate `CRON_SECRET` / `REMINDER_CRON_SECRET` values.

### 3. Half-hour booking
- `src/lib/time.ts`: the slot builder advances in 30-minute steps and accepts starts at :00 and :30 for 25- and 50-minute lessons, while checking the full lesson duration against timetable and blocked ranges.

### 4. Daily classroom and recording lifecycle
- Daily is now selectable by the teacher when its Admin → Integrations configuration is enabled.
- Daily origins are allowed in the relevant CSP and Permissions-Policy directives.
- Consent withdrawal and explicit stop first persist `stop_pending`; the state becomes `processing` only after provider confirmation.
- Recording cleanup retries `stop_pending`, and the Daily webhook avoids letting a late `recording.started` event undo a stop request. Cleanup claims retries with `stop_retrying` so overlapping scheduler calls cannot send duplicate provider stop requests; an `updated_at` lease allows recovery if a serverless invocation dies mid-call.
- The recording access endpoint remains participant-scoped and issues a temporary provider download redirect only for ready, unexpired recordings.

### 5. Scheduler security and compatibility
- `vercel.json` keeps only the daily cleanup Cron so it is compatible with Hobby cadence.
- External scheduler configuration is documented for settlement (every 5 minutes), recording stop retry/cleanup (every 5 minutes), and lesson reminders (every minute).
- Reminder delivery uses only `REMINDER_CRON_SECRET`; settlement and recording cleanup use `CRON_SECRET`.

### 6. Additional privacy and tests
- Admin overview masks payout account details; wallet history selects only fields needed for display.
- Added `scripts/phase1.test.ts` and `npm run test:phase1` for payout crypto and half-hour slot regression tests.

## Verification actually performed

- TypeScript/TSX syntax transpile: **159 files parsed, 0 syntax diagnostics**.
- `node --check` over all `scripts/*.mjs`: passed.
- `package.json` vs root `package-lock.json` dependency consistency: passed.
- Targeted runtime smoke tests: AES-GCM encrypt/decrypt, unique IV, masking, legacy plaintext compatibility, wrong-key fail-closed behavior, and 50-minute :30 slot checks: passed.
- Hosted environment validator smoke test with dummy values: passed; expected warnings for missing optional provider configuration were printed.

## Not verified / required before production

- `npm ci` did not complete in this environment; therefore `npm run typecheck`, `npm run lint`, `npm run build`, and the committed `npm run test:phase1` command have not been run end-to-end against the full dependency tree.
- No Neon database was connected. Migrations `0010` and `0011` have **not** been applied, and the legacy payout encryption script has **not** been run against real data.
- No Vercel deployment or provider credentials were accessed. Daily, email, Stripe, Supabase, Cron, webhook and browser E2E flows still need staging validation.
- Do not change or newly set `INTEGRATION_ENCRYPTION_KEY` for an existing database unless the existing integration credentials are migrated. Older data may have been encrypted with `SESSION_SECRET`.

## Safe deployment sequence

1. Take a Neon backup/snapshot and test on a separate Neon branch.
2. Set a stable `PAYOUT_ENCRYPTION_KEY` (32+ random characters) in the target Vercel environment. Also retain the existing `SESSION_SECRET` and integration-encryption setup.
3. Run `npm run db:migrate` in the controlled release environment with `ALLOW_PRODUCTION_MIGRATIONS=true` only for the intended database; verify migrations `0010` and `0011` are recorded.
4. Run `npm run db:encrypt-payout-data` (dry-run), verify counts, then run `npm run db:encrypt-payout-data -- --apply` after backup.
5. Configure independent `CRON_SECRET` and `REMINDER_CRON_SECRET`; set an external scheduler according to `DEPLOYMENT.md`.
6. Run `npm ci`, `npm run typecheck`, `npm run lint`, `npm run test:phase1`, `npm run build`, then run booking/refund concurrency tests and provider E2E tests against staging.
7. Deploy only after the staging results and Vercel logs are clean.
