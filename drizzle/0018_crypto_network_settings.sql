-- Independent direct-wallet and gateway availability per supported network.
CREATE TABLE IF NOT EXISTS crypto_network_settings (
  asset text PRIMARY KEY CHECK (asset IN ('usdt_trc20','usdt_bep20','bnb_bep20','trx_tron')),
  direct_enabled boolean NOT NULL DEFAULT false,
  nowpayments_enabled boolean NOT NULL DEFAULT true,
  plisio_enabled boolean NOT NULL DEFAULT true,
  receive_address text NOT NULL DEFAULT '',
  updated_by integer REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (NOT direct_enabled OR receive_address <> '')
);
-- Evidence retained on the order as well as in the append-only admin audit log.
ALTER TABLE crypto_payment_orders ADD COLUMN IF NOT EXISTS verified_amount text NOT NULL DEFAULT '';
ALTER TABLE crypto_payment_orders ADD COLUMN IF NOT EXISTS explorer_url text NOT NULL DEFAULT '';
