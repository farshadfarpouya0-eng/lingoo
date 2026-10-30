-- Adds explicit end timestamps for time-limited account suspensions.
ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended_until timestamp;
CREATE INDEX IF NOT EXISTS users_suspended_until_idx
  ON users(suspended_until)
  WHERE suspended = true AND suspended_until IS NOT NULL;
