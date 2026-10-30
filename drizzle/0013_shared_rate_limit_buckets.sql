-- Shared database-backed fixed-window rate limiting for serverless deployments.
CREATE TABLE IF NOT EXISTS rate_limit_buckets (
  key text PRIMARY KEY,
  count integer NOT NULL DEFAULT 0,
  expires_at timestamp NOT NULL,
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rate_limit_expires_idx ON rate_limit_buckets(expires_at);
