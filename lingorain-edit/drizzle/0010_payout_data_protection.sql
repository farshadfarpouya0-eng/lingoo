CREATE TABLE IF NOT EXISTS payout_account_access_logs (
  id serial PRIMARY KEY,
  admin_id integer NOT NULL REFERENCES users(id),
  payout_id integer NOT NULL REFERENCES payouts(id),
  purpose text NOT NULL DEFAULT 'payout_processing',
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payout_access_admin_idx ON payout_account_access_logs(admin_id, created_at);
CREATE INDEX IF NOT EXISTS payout_access_payout_idx ON payout_account_access_logs(payout_id, created_at);
