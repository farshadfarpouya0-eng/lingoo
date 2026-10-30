# Lingorain release status — Phase 2 source completion

**Status: Source changes prepared for the next Vercel deployment step. No production deployment or live database migration has been performed.** The current archive combines the previous Phase 1 corrections with Phase 2 account, timezone, concurrency, payout workflow, audit and scheduled-job changes.

## Phase 1 carried forward

- Semi-private pending lesson cancellation refunds every active seat with per-seat idempotency.
- Payout account values use AES-256-GCM; routine views are masked and admin reveal is permission-checked and logged.
- Half-hour booking supports :00 and :30 starts for 25- and 50-minute lessons.
- Daily recording selection is available when configured; consent and stop/retry flow remains integrated with the existing classroom.
- Frequent settlement and reminders use a documented external scheduler; Vercel-native Cron remains daily for compatibility with Hobby.

## Phase 2 source changes

- User and teacher profiles store IANA timezone identifiers; timetable generation uses local wall-clock time and rejects nonexistent DST-gap times.
- Session sequence display is course/package scoped and excludes refunded seats.
- Registration now requires email verification; login blocks unverified accounts. Resend verification and one-time password reset screens/actions are included.
- Email token hashes are stored rather than raw tokens; tokens expire, are single-use, and password reset revokes active sessions.
- Verification resend and password reset use both IP and normalized-email rate limits.
- Serverless rate limiting uses shared PostgreSQL atomic counters by default, with optional Upstash Redis; production fails closed if the shared limiter is unavailable.
- Admin balance adjustments, teacher document reviews and payout transitions write audit records.
- Payout state transitions support pending → approved → processing → paid, with a provider reference required before marking paid and one-time balance restoration on rejection.
- Admin audit and scheduled operations pages are included.
- Shared classroom workspace updates use optimistic revision checks and expose conflicts instead of overwriting concurrent edits.
- Legacy in-memory classroom media endpoint is retired with an explicit 410 response; persistent private storage remains the supported path.
- Scheduled jobs record execution status, duration, summary and errors when migration 0014 is installed.
- `.env.example`, deployment instructions and integration status descriptions were updated for the current code.

- Moderation sanctions now support 7-day, 30-day and permanent suspension; expiry is enforced across authentication, booking, package purchase, public tutor discovery and classroom access.
- Admin account edits now audit permanent suspension/reinstatement; admin password resets revoke existing sessions, require 12+ characters and write audit events; role changes revoke sessions and are audited.
- Temporary account suspension uses new migration `0015_temporary_suspensions.sql` and remains appealable through the account safety page.

## Required hosted setup still owned by the operator

1. Back up the target Neon database and apply all outstanding migrations through `0015_temporary_suspensions.sql` using the Direct connection.
2. Keep `SESSION_SECRET`, `PAYOUT_ENCRYPTION_KEY`, `CRON_SECRET`, `REMINDER_CRON_SECRET` stable and distinct. Preserve the old `SESSION_SECRET` if it was used to encrypt existing integration settings; do not rotate integration encryption without a data migration.
3. Run the payout-data encryption script in dry-run mode, inspect the row count, and only then run `--apply` against the intended database.
4. Configure `APP_URL`, Resend, private Supabase Storage, Stripe/webhooks, Daily/webhooks and the external scheduler as required by the enabled features.
5. Create a production admin account using `scripts/create-admin.ts`.

## Deliberately not done at the user's request

- No `npm ci`, typecheck, lint, test suite, build or browser E2E was run in this phase; the user asked to complete source work first and test later.
- No Neon migration or encryption script was run against live data.
- No GitHub push, Vercel environment changes or deployment was performed.

## Known remaining integration limitations to verify in the later test/deployment phase

- Real camera/audio quality is still provider/browser dependent. The classroom's displayed RTT measures the Lingorain API round trip, not peer media transport quality; do not present it as a video quality score.
- Daily cloud recording requires an eligible Daily account, provider-side recording entitlement, registered webhook and successful consent-to-recording tests.
- Accurate minute-level reminders and five-minute settlement/retry depend on a reliable external scheduler calling the documented authenticated endpoints.
- End-to-end payment, email delivery, private storage, multi-user classroom conflict, payout and refund behavior require staging integration tests before production traffic.

This release status describes source changes and configuration needs, not a claim that the project has passed a production build or is production-certified.
