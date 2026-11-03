# Crypto wallet setup and recovery

The student Wallet page must remain available even when crypto payments are not yet initialized. `WalletPanel` checks for `public.crypto_payment_orders` before querying crypto orders. If migration 0017 is missing, it keeps the ordinary balance, payout and transaction-history UI visible and displays a setup notice. Crypto creation, direct-proof submission, admin review and callbacks are guarded until the table exists. Direct wallet transfers no longer require `APP_URL`; the public HTTPS `APP_URL` is required only for automatic provider callback URLs.

## Check whether the migration is missing

Run this read-only query in Neon SQL Editor:

```sql
SELECT to_regclass('public.crypto_payment_orders') AS crypto_orders_table;
```

A `null` result means the table is not present in the `public` schema.

## Apply the missing schema safely

1. Back up the production Neon database and preferably test on a separate Neon branch first.
2. Confirm whether `0017_crypto_payments.sql` has already been applied.
3. If it is pending, use the controlled migration procedure documented in `DEPLOYMENT.md` (direct Neon connection, `ALLOW_PRODUCTION_MIGRATIONS=true`, then `npm run db:migrate`). The migration runner skips versions already recorded in `lingorain_schema_migrations`.
4. Redeploy/retry Wallet and verify the table exists.

Do not run `drizzle-kit push` against production. Do not credit a wallet manually to compensate for an unverified crypto callback or direct transfer.
