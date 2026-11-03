# Accounting and page-render reliability fixes

## Changes
- Teacher earning journals now write a single `platform_clearing` debit for the full gross amount. The former implementation wrote separate clearing rows for teacher base pay and platform commission, conflicting with the unique `(transaction_id, account_code)` index.
- Teacher earning creation now claims the unique transaction reference before updating the teacher wallet. Concurrent completion attempts that lose the claim return without changing balances. Performance bonuses are similarly claimed before crediting the wallet.
- Removed automatic lesson settlement from Dashboard, Admin Dashboard, and Admin Students server-page rendering. Rendering a page is now read-only with respect to lesson settlement.
- Added an authenticated `/api/cron/lesson-settlement` endpoint and a Vercel five-minute schedule. It requires `CRON_SECRET` (at least 32 characters), and invokes the existing conditional/transactional settlement logic.

## Deployment
- Set a strong `CRON_SECRET` in Vercel Production and Preview environments as appropriate.
- Deploy the code. Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` for scheduled requests.
- Do not manually delete or rewrite historical accounting rows and do not remove the unique index.
- Existing historical transactions are not migrated by this change. The duplicate journal attempt shown in the reported stack trace should be investigated against transaction 37 before any manual correction.

## Validation status
- Source-level inspection completed for the accounting entry call sites and page-level settlement calls.
- `npm ci` did not complete within the available execution window, so TypeScript checks and `next build` could not be run here. A successful production build and Neon/Vercel smoke test are still required before considering the deployment verified.
