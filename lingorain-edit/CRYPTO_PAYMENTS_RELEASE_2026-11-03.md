# Lingorain crypto payments — release notes (2026-11-03)

## Scope
This release adds student wallet top-ups only. It does not create crypto withdrawals, payouts, swaps or a custodial wallet.

### Accepted assets and networks
- USDT on TRON / TRC20
- USDT on BNB Smart Chain / BEP20
- BNB (native coin) on BNB Smart Chain
- TRX (native coin) on TRON

Plisio's official supported-currency list explicitly identifies `USDT_TRX`, `USDT_BSC`, `BNB`, and `TRX`. NOWPayments is integrated using its direct-payment endpoint and merchant IPN callback; the merchant account must have each selected currency enabled.

## Payment methods
1. **Automatic gateway** — NOWPayments or Plisio creates an invoice/payment request. The signed callback updates status. Wallet credit occurs only for `finished` (NOWPayments) or `completed` (Plisio), and the ledger reference is unique to prevent duplicate credits.
2. **Direct wallet** — admin configures public receiving addresses. USDT amount is quoted 1:1 against USD; BNB/TRX amount is calculated from a live USD quote and expires after 10 minutes. USDT direct requests expire after 30 minutes.
3. **Admin-reviewed direct payment** — student submits a transaction hash. Status becomes `pending_review`; balance is untouched until an admin explicitly approves. Reject requires a reason.

## Required production setup
1. Back up Neon and test on a separate Neon branch.
2. Apply migration `drizzle/0017_crypto_payments.sql` using the project's migration runner. Do not use `db:push` for production.
3. Ensure `APP_URL` is the canonical public HTTPS origin.
4. In Admin → Integrations, enter NOWPayments API key + IPN secret and/or Plisio shop secret. Configure the exact callbacks:
   - `https://YOUR_DOMAIN/api/crypto/nowpayments`
   - `https://YOUR_DOMAIN/api/crypto/plisio?json=true`
5. If using direct wallet transfers, enter only public receive addresses in the matching network fields. Never enter a private key, seed phrase or wallet password.
6. In Admin → Crypto payments, verify network, token/coin, destination address, exact amount and on-chain confirmation before approving. A transaction hash alone is not proof of the correct payment.
7. Test underpayment, overpayment, expiration, wrong-network transfers, duplicate callbacks, duplicate TX hashes, rejected manual requests and retry behavior on staging before accepting live payments.

## Environment variables
Optional alternatives to encrypted Admin settings:
- `NOWPAYMENTS_API_KEY`
- `NOWPAYMENTS_IPN_SECRET`
- `PLISIO_SECRET_KEY`
- `CRYPTO_DIRECT_USDT_TRC20`
- `CRYPTO_DIRECT_USDT_BEP20`
- `CRYPTO_DIRECT_BNB_BEP20`
- `CRYPTO_DIRECT_TRX_TRON`

Do not commit real credentials. Existing `SESSION_SECRET` / `INTEGRATION_ENCRYPTION_KEY` stability matters because stored integration credentials are encrypted at rest.

## Safety and limitations
- This release implements wallet top-ups, not crypto payouts or refunds. Refunds require a separately designed, audited workflow.
- Direct BNB/TRX amounts use CoinGecko's public simple-price endpoint and a short quote expiry. Provider-side network fees and actual amount received must be checked by the admin.
- Provider availability, account eligibility, fees, settlement rules and supported currencies can vary by merchant country and account configuration. Confirm eligibility and KYC/KYB directly with the provider and the legally responsible business owner before going live. Any required provider accounts and identity checks must be managed by a legally eligible adult/business representative; do not bypass age or identity requirements.
- No private wallet keys are stored by Lingorain.
- A syntax transpilation check passed for the edited TypeScript/TSX files. Full `npm run typecheck`, `npm run lint`, `npm run build`, database migration and provider end-to-end checks were not completed in this environment; run them on staging before production.

## Official technical references
- NOWPayments create-payment endpoint and statuses: https://nowpayments.zendesk.com/hc/en-us/articles/21345824322717-API-and-endpoint-description
- NOWPayments IPN HMAC-SHA512 verification: https://nowpayments.zendesk.com/hc/en-us/articles/21395546303389-IPN-and-how-to-setup
- Plisio supported currencies: https://plisio.net/ru/documentation/appendices/supported-cryptocurrencies
- Plisio invoice/callback flow: https://plisio.net/es/documentation/endpoints/create-an-invoice
