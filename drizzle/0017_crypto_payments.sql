CREATE TABLE IF NOT EXISTS crypto_payment_orders (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  method text NOT NULL CHECK (method IN ('provider','direct')),
  provider text NOT NULL CHECK (provider IN ('nowpayments','plisio','direct')),
  asset text NOT NULL,
  network text NOT NULL,
  amount_usd integer NOT NULL CHECK (amount_usd IN (2000,5000,10000,20000)),
  pay_amount text NOT NULL DEFAULT '',
  pay_address text NOT NULL DEFAULT '',
  checkout_url text NOT NULL DEFAULT '',
  qr_code text NOT NULL DEFAULT '',
  provider_payment_id text NOT NULL DEFAULT '',
  tx_hash text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending',
  provider_status text NOT NULL DEFAULT '',
  admin_note text NOT NULL DEFAULT '',
  expires_at timestamptz,
  submitted_at timestamptz,
  reviewed_by integer REFERENCES users(id),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS crypto_orders_user_created_idx ON crypto_payment_orders(user_id, created_at);
CREATE INDEX IF NOT EXISTS crypto_orders_status_created_idx ON crypto_payment_orders(status, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS crypto_orders_provider_payment_unique ON crypto_payment_orders(provider, provider_payment_id) WHERE provider_payment_id <> '';
CREATE UNIQUE INDEX IF NOT EXISTS crypto_orders_network_txhash_unique ON crypto_payment_orders(network, tx_hash) WHERE tx_hash <> '';
