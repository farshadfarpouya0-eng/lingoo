# Lingorain — final source-side pass (2026-10-30)

## Additional fixes in this pass
- A student no longer sees or can open the classroom entry link while a lesson is still pending teacher approval. The teacher can still open the classroom workspace to prepare the lesson; server-side `roomState()` continues to prevent joining the live room before confirmation and the allowed entry window.
- Student dashboard lesson rows now show scheduled start and end timestamps, plus the existing teacher-approval notice while pending.
- A student can join an existing semi-private group only while its parent lesson is pending. Once the teacher confirms the group, additional seat bookings are rejected. This avoids silently adding an unapproved student to an already-confirmed class without introducing per-seat approval schema changes.
- Removed the obsolete provider-dependent label from the teacher dashboard classroom action; the provider is configured inside the classroom workspace.

## Validation performed
- All 160 non-declaration `.ts` / `.tsx` files were transpiled with the available global TypeScript compiler: zero syntax diagnostics.
- Full `npm run typecheck` could not run because the available `node_modules` directory is incomplete (type packages are empty/missing).
- `npm ci --ignore-scripts --no-audit --no-fund` was attempted but timed out; consequently the full Next.js build, lint, automated integration tests and browser-based end-to-end checks remain unverified.
- No production database, deployment, secrets, or external services were modified.

## Handoff items for the project owner
- Install dependencies in the normal development/CI environment, then run `npm ci`, `npm run typecheck`, `npm run lint`, `npm run build`, and `npm run test:phase1`.
- Test booking/payment/refund flows against a staging database, including group booking before and after teacher confirmation.
- Test LingoRoom camera/microphone, reconnect, PDF/audio sync, whiteboard, chat, and Meet/Zoom fallback with real browsers and provider credentials.
- Review and apply any pending database migrations only after backing up and checking the production migration ledger. No migration was added or applied in this pass.
- Deploy through the owner's Vercel/GitHub/Neon accounts and verify production environment variables and domain configuration.
