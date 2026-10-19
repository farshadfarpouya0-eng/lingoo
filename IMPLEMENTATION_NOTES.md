# Lingorain implementation handoff — 2026-10-19

This handoff describes source-code implementation. It does **not** assert that external accounts are provisioned or that production verification has passed.

## Completed in source (verification still required)

- 30-minute teacher availability cells and server-side teacher/student classroom access windows.
- Private lesson bookings and semi-private group classes (2–4 seats), including transactional seat capacity/join checks, wallet debit, seat-level cancellation/refund/settlement, classroom member access and group-aware dashboards.
- Participant-only classroom text chat; Pusher Channels private WebSocket transport can be enabled from Admin → Integrations. Authenticated database polling remains the fallback.
- Online/last-seen visibility controls and API round-trip latency display. This measures Lingorain API responsiveness, not the quality of the user's video/audio network path.
- Per-student reviews, aggregate teacher score, configurable teacher bonus policy and an admin control page.
- Student/teacher class reports, rule-filtered contact-link blocking in class chat, admin moderation review and suspension controls, with a user appeal route.
- Teacher identity, university and teaching credential submission, administrator verification/rejection and profile-completion score.
- Private Supabase Storage upload and access flow for teaching files, documents and avatars; server ownership/path checks and protected download for materials. The bucket must be private and enforce a maximum file size of 25 MiB or less.
- Free/paid learning library, wallet transaction/purchase records and server-checked access to paid files.
- Resend-based class reminders with an authenticated scheduled endpoint and idempotency records.
- Student referral code flow, qualifying completed paid lesson, duration-specific promotional lesson credits, reward claiming and eligible credit restoration.
- Daily private video rooms, access tokens, participant recording-consent UI and state, recording stop/start API, authenticated webhook updates, protected temporary downloads and a scheduled provider deletion/metadata cleanup endpoint after the retention period.
- Admin provider configuration/testing page for Resend, Supabase Storage, Stripe, Jitsi host, Pusher, Daily and Upstash Redis. Secrets are encrypted at rest; `INTEGRATION_ENCRYPTION_KEY` must be stable and backed up.
- Non-zero wallet transactions write balanced wallet/clearing entries; guarded migrations include the related journal, group-seat, group-review, recording and moderation schema.

## Provider configuration checklist

1. **Resend email:** verify the sending domain/address with Resend; enter API key and sender at Admin → Integrations; configure the Vercel `CRON_SECRET` (or custom scheduler `REMINDER_CRON_SECRET`).
2. **Supabase private Storage:** provision a private bucket, enter project URL, bucket and server-side service-role key; enforce a provider-side upload limit of 25 MiB or lower.
3. **Stripe:** enter test-mode secrets first, register the documented webhook URL, and test duplicate/replayed events before production.
4. **Daily recording:** enable cloud recording with the provider, enter the domain/API key and unique webhook password, set HTTPS `APP_URL`, register the webhook in Admin → Integrations, and test consent, start, stop, expiry and provider deletion.
5. **Pusher Channels (optional):** enter app credentials/cluster to enable immediate realtime chat; otherwise database polling continues to work.
6. **Upstash Redis (multi-instance deployments):** create a REST Redis database and enter its URL/token to share request limits between serverless instances.
7. Set a stable `INTEGRATION_ENCRYPTION_KEY` of 32+ characters before saving credentials. Rotating it without migration/re-encryption makes stored credentials unreadable.

## Verification and release blockers

- All 133 TypeScript/TSX files passed a syntax/transpile check in the authoring environment; all MJS scripts passed `node --check`.
- Full TypeScript semantic checks, ESLint and Next.js build could not be verified because the dependency installation is incomplete. `npm ci` failed to download packages from the npm registry (`EAI_AGAIN` DNS errors). Do not interpret the syntax-only pass as proof of a successful application build.
- No real PostgreSQL migration/integration test, concurrency test, Stripe test webhook, provider connection test or browser E2E run was possible here.
- The balanced wallet journal is a practical subledger for non-zero wallet flows, not a complete enterprise chart of accounts. Promotional credits and external cash/provider settlement need defined reconciliation procedures.
- The HTTP latency indicator is not WebRTC media-quality telemetry. Chat is WebSocket-realtime only with configured Pusher; otherwise it uses secure polling.
- This is not an independent penetration test or a guarantee of security. Run the release gate in `RELEASE_STATUS.md` before enabling production payments or recordings.
