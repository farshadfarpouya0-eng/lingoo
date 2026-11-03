# Lingorain — source completion handoff

**This archive contains the current source changes prepared for a later staging test and Vercel deployment.** No test suite, dependency installation, lint, typecheck, Next.js build, hosted migration, live data script, GitHub push, or Vercel deployment was run in this phase, per the project owner's instruction to finish implementation first and test later.

## Scope completed in source

### Financial safety and payouts
- Fixed double-entry grouping for repeated `platform_clearing` lines so the accounting uniqueness constraint is respected.
- Moved settlement side effects out of page render and into authenticated scheduled-job endpoints.
- Refunded each active participant in unapproved semi-private lessons using seat-specific idempotency references.
- Added explicit payout progression (pending → approved → processing → paid), required provider reference before paid, row locking and audited rejection/refund.
- Protected payout account details with AES-256-GCM, masked ordinary displays, and audited the controlled reveal path.
- Added audit logging for manual student/teacher balance credits, account changes, moderation decisions, password resets, role changes and relevant document/payout workflows.

### Scheduling, time and classrooms
- Half-hour booking slots, including 10:30, with overlap checks.
- IANA timezone storage and local-time scheduling, including daylight-saving gap handling.
- Course/package-scoped lesson sequencing and progress, excluding refunded seats.
- Teacher/student classroom entry windows, class state indicators, presence, chat, incident reporting, and shared classroom workspace state with revision conflict handling.
- Retired the old in-memory classroom media upload path; persistent private storage is the supported media path.
- Daily recording selection/consent/stop/retry path is kept conditional on configured Daily provider credentials, recording entitlement and webhook setup.

### Authentication, account security and moderation
- Email verification, resend verification, one-time password reset, token expiry/hash storage and session revocation after reset.
- Password minimum of 12 characters on registration, reset and administrative password actions.
- IP/email rate limits with shared PostgreSQL atomic-counter fallback and optional Upstash; production fails closed when the shared limiter cannot be used.
- Account sanctions support 7-day, 30-day or permanent suspension; expiry is applied consistently to authentication, public tutor discovery, booking, package purchases and classroom access.
- Admin role changes and password resets revoke existing sessions and write audit entries. Teacher re-promotion requires renewed public approval.
- Moderation appeals remain available to suspended users.

### Product workflows retained or completed
- Teacher identity documents and optional credentials; optional university/teaching credentials are not required for profile completion and are separately represented as verification advantages.
- Teacher profile progress score with weighted mandatory profile parts and visible incomplete tasks.
- Learning materials library with free/paid controls, categories and access after purchase/authorization.
- Referral qualification/reward workflow, teacher ratings and discovery ranking, admin credit controls, teacher withdrawal workflow, reminder routes, recording retention cleanup and integration settings.

## New database migration

- `drizzle/0015_temporary_suspensions.sql` adds `users.suspended_until` and a partial index.
- Apply migrations sequentially from `0000` through `0015` using the controlled migration procedure in `DEPLOYMENT.md`.
- Do not run migrations against live Neon until a backup exists and the target database/branch has been confirmed.

## Environment and provider prerequisites for deployment

- Required: `DATABASE_URL` (Neon pooled connection), `SESSION_SECRET`, `PAYOUT_ENCRYPTION_KEY`, `APP_URL`, `CRON_SECRET`, `REMINDER_CRON_SECRET`.
- For migrations/admin scripts: `DATABASE_DIRECT_URL` pointing to Neon Direct and deliberate confirmation before enabling `ALLOW_PRODUCTION_MIGRATIONS=true`.
- Email verification/reminders require Resend API credentials and a verified sender.
- Learning-material and private media uploads require private Supabase Storage configuration.
- Card payments require Stripe secret and webhook signing secrets configured together.
- Daily recording requires an eligible account, API key/domain, webhook credentials and provider-side recording entitlement/consent verification.
- Pusher is optional; authenticated polling fallback remains. Upstash is optional because shared PostgreSQL counters are available.
- Minute-level lesson reminders and five-minute settlement/recording retry require an external scheduler unless the Vercel plan supports the required high-frequency Cron schedule. Vercel-native Cron stays daily for Hobby compatibility.

## Later verification and release gates

When the owner is ready to test, run in this order on a staging branch/environment:
1. `npm ci`
2. `npm run typecheck`
3. `npm run lint`
4. `npm run build`
5. Back up staging Neon, then `npm run db:migrate` through migration `0015`.
6. Review the dry-run output of `npm run db:encrypt-payout-data`; apply only after confirming counts and backup.
7. Test account flows, concurrent bookings, group refunds, duplicate payment webhooks, all five dashboards, payout transitions, teacher permissions, email delivery, storage access, recording consent/retention, timezone/DST, moderation expiry/appeals and classroom collaboration.
8. Only after staging passes, push to GitHub and deploy through Vercel with production environment variables and scheduled jobs configured.

**Do not interpret the archive's integrity check as a passing build or application test.** The requested code work is bundled; external credentials, database migration, later tests and deployment remain operator-controlled steps.
