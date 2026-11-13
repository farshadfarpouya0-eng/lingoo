# Lingorain — scheduling, classroom and wallet update

Based on `farshadfarpouya0-eng/lingoo`, branch `fix/vercel-build`, revision `ed32867`. This update includes targeted source changes; it is not the earlier images-only fix.

**راهنمای فارسی نصب و توضیح تغییرات:** [docs/SCHEDULE_WALLET_FIX.fa.md](docs/SCHEDULE_WALLET_FIX.fa.md)

## What changed

- Public tutor availability and booking dates are rebuilt in the student's time zone, including midnight/date rollover. Only UTC slot instants are sent to student scheduling components, not teacher-local labels or private zone data.
- The saved account time zone is respected across booking, lesson lists and classroom pages. Signed-out visitors can use their device zone.
- Tehran and existing valid custom time zones are preserved by the private profile selectors. Saving midnight no longer changes it to 09:00.
- Crypto top-ups now use a translated, responsive three-stage flow: choose → transfer → confirmation. An uploaded TXID is **not** treated as verified payment. Existing server-side amount/network/ownership, duplicate-transaction, manual-review and one-time-credit checks remain intact.
- Expiry follows server time. Expired quotes no longer present sending instructions, and already-submitted payments keep their actual review status.
- The live JaaS client and admin test use the same AppID-scoped SDK endpoint.
- Runtime CSP and camera/microphone permissions use the admin-saved video hostname, including client-side navigation from the homepage. Existing authorization, lesson roles and entry windows remain in force.
- Admin → Integrations includes a classroom readiness check for configuration, signing, server reachability and browser reachability, without returning credentials.

## Applying to an existing live project

Keep the current `.git`, `.env`, Neon connection, credentials, encryption keys and admin account. Back up local source changes, then merge the patch files while preserving paths. The release manifest lists every included path and its checksum.

**No schema migration, new database, new administrator, secret rotation or bulk lesson-time conversion is required by this patch.** It does not repair an already-incorrect stored teacher zone by guessing: the owner/administrator must review that private setting if it was previously saved incorrectly. Existing scheduled UTC instants are not moved.

The complete download uses the same `package.json` versions as the specified branch; its `package-lock.json` is synchronized for a clean `npm ci`. Database schema, database client, deployment configuration and deployment-environment validation are unchanged from that branch.

These files are not automatically pushed to GitHub or deployed to the user's Vercel project. Existing hosting environment requirements still apply; a successful local build is not proof that credentials reached a particular hosted deployment.

## Verification

From the project root:

- `npx next typegen`
- `npm exec tsc -- --noEmit --pretty false`
- `npm run build`
- `npx tsx --test scripts/schedule-payment-regression.test.ts`

The browser suite (`scripts/scheduling-wallet-browser.test.ts`) deliberately refuses hosted databases and requires a disposable local sandbox. It creates temporary fixtures, tests real booking/order/proof/admin-approval code locally, and restores its temporary settings/data. Do not point it at Neon or run production migrations as part of this test.

Test coverage includes China/Japan conversion, local-midnight grouping, 25/50-minute choices, DST repeated hours, missing clipboard permission, expired invoices, rejection of another user's transaction proof, no credit before approval, one-time wallet credit, EN/ZH/JA mobile layouts, private-zone preservation and classroom API loading.

## External services: what is and is not verified

No real crypto transfer is made by the automated tests. Video SDK transport is mocked in the browser tests; JWT signing and access roles have separate tests. A live audio/video call using the owner's JaaS/private Jitsi account still needs a real two-participant check. Provider billing/entitlements, registered public keys, network reachability and camera/microphone permissions cannot be certified solely by entering credentials or passing a server signing test.

The existing integration settings remain the source of payment and video credentials. No secrets, `.env`, hosted database data, test accounts or synthetic receiving addresses are included in the release archives. Local demo accounts and simulated wallet credit remain restricted to the original local demo policy.
