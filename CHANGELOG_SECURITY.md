# Security and classroom update — 2026-10-19

This update builds on `lingorain-security-reviewed.zip` and adds:

- Authenticated classroom chat API for lesson participants only.
- Server-side chat access window, per-user send/read rate limits, message size limits and control-character rejection.
- A small client chat panel that polls for new messages every 2.5 seconds and preserves messages when a temporary poll fails.
- Server-side early-entry rule: teacher 30 minutes before class, student 10 minutes before class.
- Rate-limit IP parsing no longer trusts forwarding headers by default. Configure `TRUST_PROXY_HEADERS=true` only behind a proxy that overwrites client-supplied forwarding headers.

## Verification status

The source and ZIP structure were checked. A full TypeScript/lint/build run could not be completed because dependencies could not be installed in this execution environment; the existing `node_modules` directory is incomplete. A PostgreSQL-backed integration test and production provider integrations were not available. Do not deploy this archive as certified or fully production-ready without completing the outstanding checklist in `SECURITY_REVIEW.md` and `IMPLEMENTATION_NOTES.md`.
