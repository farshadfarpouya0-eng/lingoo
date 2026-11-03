-- Balanced wallet subledger. `platform_clearing` is a control account and must
-- be reconciled to external cash, payment-provider settlement and payout records.
CREATE TABLE IF NOT EXISTS accounting_entries (
  id SERIAL PRIMARY KEY,
  transaction_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE RESTRICT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  account_code TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('debit','credit')),
  amount INTEGER NOT NULL CHECK (amount > 0),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT accounting_entries_transaction_account_unique UNIQUE (transaction_id, account_code)
);
CREATE INDEX IF NOT EXISTS accounting_entries_account_idx ON accounting_entries(account_code, created_at);
CREATE INDEX IF NOT EXISTS accounting_entries_user_idx ON accounting_entries(user_id, created_at);

-- Backfill existing non-zero wallet transactions so historic balances remain auditable.
INSERT INTO accounting_entries (transaction_id, user_id, account_code, side, amount)
SELECT id, user_id, 'wallet:' || user_id::text,
       CASE WHEN amount > 0 THEN 'credit' ELSE 'debit' END, abs(amount)
FROM transactions WHERE amount <> 0
ON CONFLICT (transaction_id, account_code) DO NOTHING;
INSERT INTO accounting_entries (transaction_id, user_id, account_code, side, amount)
SELECT id, user_id, 'platform_clearing',
       CASE WHEN amount > 0 THEN 'debit' ELSE 'credit' END, abs(amount)
FROM transactions WHERE amount <> 0
ON CONFLICT (transaction_id, account_code) DO NOTHING;
