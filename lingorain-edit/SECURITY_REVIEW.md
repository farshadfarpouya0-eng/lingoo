# Lingorain security review — current handoff

This document points to the current source state. It is a code-level review summary, not a formal penetration test or guarantee of security.

## Current implementation areas

- Password registration/reset/admin reset policies require at least 12 characters; verification and reset tokens are hashed, expiring and single-use. Password resets and role changes revoke old sessions.
- Admin account, role, password, payout, balance and moderation decisions are auditable.
- Account suspension can be 7 days, 30 days or permanent and is enforced across authentication, public teacher discovery, bookings, package purchase and classroom access.
- Payout account details are encrypted at rest and normally masked; authorized reveals are audited.
- Financial operations use locked/idempotent workflows for the areas described in `LINGORAIN_SOURCE_COMPLETION.md` and `ACCOUNTING_FIX_NOTES.md`.
- Server-side role and lesson-participant checks protect classroom, material and document access.
- Shared PostgreSQL rate-limit counters coordinate serverless instances when Upstash is not configured.

## Release risks that remain

1. This archive has not passed the requested later `npm ci`, `typecheck`, `lint`, `build`, browser E2E or provider integration test phase.
2. No migration has been applied to the real Neon database. Back up the target and apply migrations `0000` through `0015` only through the documented controlled procedure.
3. Existing payout records must be reviewed through the encryption script dry-run and encrypted only after confirming the target database and backup.
4. Resend, Supabase Storage, Stripe/webhooks, Daily/webhooks and the external scheduler require real provider credentials and staging verification.
5. High-frequency reminder and settlement schedules need a reliable external scheduler unless the Vercel plan supports the required cadence.
6. The classroom RTT indicator measures Lingorain API round-trip responsiveness, not actual peer video/audio media quality. Media quality remains provider/browser dependent.
7. Daily cloud recording requires provider-side entitlement, webhook setup, consent validation, retention and deletion tests.

## Release checklist

Follow the ordered staging and Vercel steps in `DEPLOYMENT.md` and `LINGORAIN_SOURCE_COMPLETION.md`. Do not enable real-money payments, sensitive identity-document uploads or production recording until the relevant staging checks pass. Do not treat ZIP integrity as build or runtime verification.
