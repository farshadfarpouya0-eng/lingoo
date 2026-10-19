# Lingorain release status — 2026-10-19

**Status: advanced implementation candidate; not yet verified as production-ready.** Core source for the requested workflows is present, but complete typecheck/build/E2E tests and live provider/database verification could not be completed in this environment.

## Implemented in source

- Authentication, student/teacher/admin dashboards, role checks, suspended-account handling, teacher profiles and 30-minute timetable slots.
- Private lesson booking and semi-private classes with 2–4 seats: join/capacity checks under a transaction/teacher advisory lock, wallet-funded seats, independent seat cancellation, teacher cancellation refunds, per-seat settlement and course/session progress.
- Server-side classroom access windows; participant-authorized chat with Pusher private-channel WebSocket delivery when configured and authenticated polling fallback; presence visibility controls and API round-trip latency display.
- Per-student reviews for group classes, review aggregation and configurable teacher bonus policy with an admin page.
- Class issue reports, participant misconduct reports, admin case review/suspension/reinstatement and an appeal submission/review path.
- Teacher identity/university/teaching document submissions with admin review; profile completion reflects profile/document status.
- Private Supabase Storage upload/access paths for protected materials, teacher documents and avatars; server-side upload preparation/access controls, private bucket validation and a required bucket upload-size cap of 25 MiB or less.
- Free/paid learning materials, wallet-funded purchases, transaction records and server-side paid-content access checks.
- Resend lesson reminders through an authenticated scheduler endpoint and cron configuration; idempotent reminder-log claim to reduce duplicate sends.
- Referral codes, referral qualification after a completed paid lesson, referral lesson credits, reward claiming/consumption and restoration when eligible lessons are cancelled.
- Daily private video-room provisioning and access tokens, per-participant recording consent, recording start/stop state, authenticated provider webhook handling, protected temporary download links, and a scheduled cleanup endpoint for recordings after their retention window.
- Admin Integrations page to configure/test email (Resend), private file storage (Supabase), payments (Stripe), classroom video domain (Jitsi), managed live chat (Pusher), recording (Daily), and shared rate limits (Upstash Redis). Provider secrets are encrypted at rest in the database using AES-256-GCM.
- Wallet transaction journal with balanced wallet/clearing entries for non-zero wallet transactions; unique references/idempotency protections on important flows; payout request reservation/rejection refund flows.
- Checked-in SQL migrations, including group seating/reviews/moderation/recording and wallet journal structures. Application build does not automatically run schema migrations.
- Seed/demo safeguards and deployment preflight checks for hosted builds.

## External setup required in Admin / hosting

- Set a stable `INTEGRATION_ENCRYPTION_KEY` (at least 32 characters) in the host before saving provider secrets. Back it up securely; rotating it without re-encrypting stored secrets makes saved settings unreadable.
- Resend: create the account, verify a sender/domain, configure the sender and API key, then configure the deployment cron secret.
- Supabase: create a **private** Storage bucket; use the service-role key only server-side; set the provider-enforced object limit to at most 25 MiB and review bucket CORS.
- Stripe: configure secret and webhook signing keys and register the endpoint listed in `DEPLOYMENT.md`.
- Daily: configure API key/domain and cloud recording entitlement; set `APP_URL` to the deployed HTTPS origin, set a unique webhook password, save credentials and register the webhook from Admin → Integrations.
- Pusher Channels: optional; configure app ID/key/secret/cluster for WebSocket delivery. Without it, chat falls back to authenticated polling.
- Upstash Redis: strongly recommended for multi-instance deployments. Without it, rate limiting is process-local and is not shared between serverless instances.
- Apply SQL migrations deliberately to a backed-up staging database, then production, using `npm run db:migrate`.

## Known gaps / limitations

- Full automated TypeScript checking, lint, Next.js production build and PostgreSQL/E2E/provider integration tests have **not** passed in this environment. The `npm ci` attempt failed because npm registry requests returned DNS `EAI_AGAIN`; the present `node_modules` is incomplete.
- A syntax-only transpile check of all 133 TypeScript/TSX source files passed, as did `node --check` for the MJS scripts. This is not a substitute for semantic typechecking or a production build.
- No live PostgreSQL database or provider credentials were available for migration, payment, email, storage, video, recording, Redis or realtime end-to-end tests.
- Reported connection latency is an HTTP round-trip to the Lingorain API, not WebRTC peer audio/video statistics or bandwidth estimation.
- The wallet journal balances non-zero wallet transactions to a platform-clearing control account, but it is not a full enterprise accounting/general-ledger system. Non-cash package/referral credits and provider settlement reconciliation need separately defined accounting and reconciliation procedures.
- Text-contact filtering is narrow rule-based protection, not perfect detection. Admins must review cases; automatic blocking is not proof of misconduct.
- In-memory rate limiting remains a fallback for single-instance local use. Configure Upstash for shared enforcement; if Redis credentials are configured but the service fails, the shared limiter rejects requests rather than silently falling back.
- This work has not undergone an independent penetration test or security certification.

## Required release gate

On a staging deployment with package-registry access and real test credentials: install dependencies from `package-lock.json`; run `npm run typecheck`, `npm run lint`, and `npm run build`; apply migrations to an empty and an upgraded PostgreSQL database; run concurrency/idempotency tests for group seats, refunds, payouts, reminders and Stripe webhooks; then test each enabled provider in Admin → Integrations. Do not enable real charges or cloud recording until those checks and consent/retention tests pass.
