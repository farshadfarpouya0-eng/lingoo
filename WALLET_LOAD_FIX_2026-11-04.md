# Wallet load fix — 2026-11-04

## Root cause addressed

The student Wallet server component queried `crypto_payment_orders` unconditionally. On a Neon database where migration `0017_crypto_payments.sql` had not yet been applied, that single optional feature query threw and caused the whole route to render the generic `This page could not load` error boundary.

## Changes

- Added `src/lib/crypto-schema.ts`, which checks for `public.crypto_payment_orders` via PostgreSQL `to_regclass` before the app queries the crypto table.
- Updated `WalletPanel` to keep the standard wallet balance, Stripe top-up area, payout details, and transaction history renderable even when the crypto table or saved integration settings are unavailable.
- When migration 0017 is missing, only crypto top-ups are disabled and the Wallet displays an actionable setup notice.
- Guarded crypto top-up actions, direct transaction proof submission, admin review actions, the admin crypto payments page, and provider callbacks against a missing crypto table.
- Direct-wallet transfer creation no longer requires `APP_URL`; `APP_URL` remains required for automatic provider callback URLs.
- Updated deployment documentation to cover migration 0017 and the Wallet recovery behavior.
- Retained the prior `LingoRoom.tsx` TypeScript fixes in this full package.

## Database status

No database was modified by this code change. The production Neon database still needs to be inspected. If the read-only query below returns `null`, migration 0017 must be applied through the controlled release procedure after taking a backup:

```sql
SELECT to_regclass('public.crypto_payment_orders') AS crypto_orders_table;
```

Do not use `drizzle-kit push` against production. Follow `DEPLOYMENT.md` for the migration runner and direct Neon connection.

## Verification

- TypeScript/TSX syntax transpilation passed for all seven edited source files.
- ZIP integrity is checked after packaging.
- Full `npm run typecheck` and `npm run build` were not run in this environment because this extracted source package has no `node_modules` directory.
- No live Neon database, provider callback, or actual payment was tested.
