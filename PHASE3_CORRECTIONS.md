# Lingorain correction pass — classroom, materials, crypto

## 1. Video room / Jitsi

The previous anonymous `meet.jit.si` path is not used for real lessons. LingoRoom requires a configured production provider (8x8 JaaS or a private JWT-protected Jitsi server). The server issues short-lived, room-scoped tokens; the teacher is moderator and the student is participant. Connection state is based on the provider's join event, with timeout/retry. See `CLASSROOM_VIDEO_FIX.md` for provider setup.

## 2. Whiteboard and classroom layout

- The outer lesson sidebar moves below the classroom until the `xl` breakpoint, so laptop widths no longer squeeze the video into a narrow column.
- The studio side panel has a bounded height and its own scroll area.
- The teaching workspace uses container queries and stacks controls in narrow panels.
- The whiteboard keeps a fixed aspect ratio on laptop/mobile instead of stretching strokes.
- Switching between video and whiteboard keeps the video iframe mounted.
- Fixed a race where an early book selection could be overwritten or left unsaved by the first workspace response.

## 3. Books, PDF and audio

- Added one shared decoder for structured courses, legacy single-file PDFs/audio, and older `audioUrl` fields.
- Protected asset endpoints and the teacher demo use the same decoder.
- Replaced the browser-dependent PDF iframe with a local PDF.js reader, worker and font assets. The teacher's page state renders the same page for the student.
- Missing/unsafe PDF references now produce an actionable message.
- Admins can attach or replace a PDF on an existing textbook/worksheet without recreating the course.
- Student audio has an explicit one-click unlock and then follows the teacher's shared playback position.

## 4. Crypto settings and review

- Added migration `0018_crypto_network_settings.sql` and the `crypto_network_settings` table.
- New Admin → Crypto Settings page controls each of USDT-TRC20, USDT-BEP20, BNB-BEP20 and TRX-TRON independently: direct transfers, NOWPayments, Plisio, and the public receiving address.
- Wallet top-up forms and server actions enforce the saved network/provider availability.
- Direct approval now requires a verified received amount, an official explorer URL containing the transaction hash, and an explicit verification checkbox. Evidence is stored on the order and in the audit log.
- Provider settlement rejects underpaid confirmations and remains idempotent for duplicate callbacks.
- Plisio callbacks use the documented JSON callback format, sorted signed payload, currency and USD source-amount checks.

## 5. Verification

Automated checks added/used:

- `scripts/phase3-regression.test.ts`: material decoding, exact decimal amounts, network addresses and explorer evidence.
- `scripts/crypto-flow.test.ts`: persistent network toggles, underpayment guard, duplicate callback idempotency.
- `scripts/video-security.test.ts`: video JWT signatures, roles, expiry and fail-closed provider policy.
- `scripts/video-access.test.ts`: token API membership/suspension/window/admin restrictions (isolated local server).
- `scripts/browser-regression.ts`: teacher/student login fixtures, PDF page synchronization, whiteboard layout at 1024px and 390px, crypto settings, direct proof submission and admin approval.
- All migrations `0000` through `0018` were applied successfully to a fresh temporary database, then rerun to verify skip/idempotent behavior.

External limits: a real camera/audio call still needs valid JaaS/private-Jitsi credentials; real gateway settlement still needs NOWPayments/Plisio merchant credentials and provider-side test payments; private PDF/audio storage still needs the configured Supabase bucket. The browser regression mocks the external video transport and PDF bytes, but uses the real local database/workspace/admin/payment-approval flow. No production database, GitHub remote or live payment provider was changed by these tests.
