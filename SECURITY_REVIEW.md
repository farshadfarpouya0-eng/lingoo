# Lingorain security review — 2026-10-19

## Security changes present in this source

- Admin lesson cancellation uses the shared refund routine so package-funded and referral-credit-funded lessons restore their original credit type; the transition and refund run in one database transaction.
- Student and teacher balance adjustments lock the account row, constrain adjustment size, prevent a negative balance, and record a transaction with an audit note.
- Stripe webhook validation uses the raw payload and signature timestamp with timing-safe comparison; it requires a paid session, USD, a whitelisted amount matching metadata, a student account and a unique transaction reference before crediting.
- Session cookies are HTTP-only, SameSite=Lax and Secure in production; session database values are hashed and suspended users are rejected by authentication.
- Teacher documents and learning materials are served through authenticated app routes, not redirected to arbitrary public URLs. Legacy external teacher document links are rejected. Private-storage references are constrained to the configured bucket and expected owner prefix; uploaded file signatures are checked server-side.
- The application refuses a public Supabase bucket and requires the bucket itself to limit files to 25 MiB or less to constrain signed direct uploads.
- Classroom chat reads and writes are participant-scoped, length-limited and rate-limited. Classroom access windows are enforced server-side, not just by the UI.
- Admin document and report workflow handlers require administrator authorization. Referral lesson credits and wallet updates are changed transactionally.
- Seed/deployment scripts avoid printing admin secrets and block demo accounts/simulated payments in hosted deployments.
- `CRON_SECRET` takes precedence for native Vercel Cron; a custom scheduler may use `REMINDER_CRON_SECRET` with an explicitly configured Bearer header.

## Risks / incomplete requirements

- **Not a penetration test.** This is a source-code review and targeted implementation work, not a guarantee against every exploit.
- **Dependency verification:** full `npm ci` could not complete in this environment, so typecheck/lint/build have not passed. Run those and dependency/secret scanning before release.
- **Database verification:** SQL migrations were not applied to a test PostgreSQL instance here. Back up any existing database and validate migrations, uniqueness assumptions, and rollback/recovery in staging.
- **Rate limiting:** in-memory buckets do not coordinate across serverless instances and may reset on restarts. A shared store is required for reliable platform-wide limits.
- **Semi-private class booking:** schema foundations do not provide completed shared-seat booking/capacity enforcement. Do not advertise 2–4-student classes until the full participant and payment model is implemented and tested.
- **Recordings:** recording consent, controlled retrieval and deletion after seven days are not implemented end-to-end. Do not enable recordings until that workflow and provider are configured.
- **Class quality:** app API RTT is not peer media quality. Jitsi/WebRTC stats are not currently collected.
- **Accounting:** transactions are auditable, but the system is not a comprehensive double-entry ledger. Reconcile top-ups, lesson earnings, package refunds, referral credits, payouts and manual adjustments under concurrent operations before real-money launch.
- **Teacher ranking/bonuses and enforcement/appeals:** aggregate reviews exist, but a fully audited bonus algorithm and complete abuse enforcement/appeal workflow remain to be implemented.
- **External secrets/providers:** confirm production `SESSION_SECRET`, Stripe keys/webhook, private Supabase bucket configuration/limit/CORS, Resend sender/cron secret, canonical `APP_URL`, database TLS and Jitsi/video configuration. Never put service-role or cron secrets in `NEXT_PUBLIC_*` variables.

## Required pre-release checks

1. Run `npm ci` from the checked-in lockfile and then `npm run typecheck`, `npm run lint`, and `npm run build`.
2. Apply migrations to staging; test with a PostgreSQL instance before any production migration.
3. Add E2E tests for authorization, paid-material entitlement, upload size/type/path validation, cancelled/refunded package bookings, parallel reservations, concurrent payouts and replayed Stripe webhooks.
4. Verify scheduled reminder delivery and failure/retry behavior in staging.
5. Run dependency vulnerability scanning, secret scanning, OWASP-style authorization checks, and an independent review before accepting real money or sensitive identity documents.
