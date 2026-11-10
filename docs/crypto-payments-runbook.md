# Crypto wallet top-ups — operator runbook

## Supported paths

- Automatic NOWPayments and Plisio invoices.
- Direct transfers to admin-configured public receiving addresses, followed by manual admin verification.
- Supported networks: USDT-TRC20, USDT-BEP20, BNB-BEP20 and TRX-TRON. Each network/provider can be enabled separately in **Admin → Crypto Settings**.

This feature only credits the in-app wallet. It does not provide crypto withdrawals, refunds, swaps or custody.

## Production setup

1. Back up the database and apply migrations `0017_crypto_payments.sql` and `0018_crypto_network_settings.sql` using the controlled migration procedure. Do not use `drizzle-kit push` on production.
2. Set `APP_URL` to the canonical public HTTPS origin. Gateway callbacks will fail without it.
3. In **Admin → Integrations**, save the NOWPayments API key/IPN secret and/or Plisio shop secret. Test the connection.
4. In **Admin → Crypto Settings**, set each public receiving address and enable only the networks/providers that should accept new payments. Never enter a private key, seed phrase or wallet password.
5. Configure provider callbacks:
   - NOWPayments: `https://YOUR_DOMAIN/api/crypto/nowpayments`
   - Plisio: `https://YOUR_DOMAIN/api/crypto/plisio?json=true`

Existing invoices can still settle after a network is disabled for new requests.

## Verification and reconciliation

- Callbacks are signature-checked and must match the local order, provider payment ID, asset/currency and USD amount.
- A provider completion without a verifiable received crypto amount does **not** credit the wallet; it is shown as underpaid.
- NOWPayments `finished` and Plisio `completed` can credit once. Plisio overpayment (`mismatch`) credits only the requested USD amount when the received crypto amount is at least the invoice amount.
- Duplicate callbacks cannot credit twice because the wallet ledger reference is unique per provider order.
- If a callback is missed, the student can use **Check status** in the wallet, or an admin can use **Sync provider status** in **Admin → Crypto payments**. Sync re-queries the provider and applies the same amount/currency checks before crediting.
- Direct transfers remain `pending_review` until an admin independently checks the network, destination, asset, amount and confirmation, records the verified amount and official explorer URL, and approves. The approval and rejection are audited.

## Operational limits to test with real provider accounts

Automated tests use local database fixtures and provider-response parsers; they cannot prove a merchant account is eligible or that a live provider payment settles. Before accepting real funds, test each enabled provider/network with the smallest amount for: successful payment, underpayment, overpayment, expiry, duplicate callback, wrong network and provider-status sync.

Direct BNB/TRX quotes come from CoinGecko's public price endpoint and expire after 10 minutes. Provider fees, merchant-country eligibility, KYC/KYB and settlement rules must be confirmed with the provider. Provider refunds are not implemented and require a separately designed workflow.
