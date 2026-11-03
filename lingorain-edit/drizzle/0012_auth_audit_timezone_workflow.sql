-- Profile timezone, email verification/reset tokens, financial auditability,
-- explicit payout review flow, credential trust badge and workspace concurrency.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email_verified boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS time_zone text NOT NULL DEFAULT 'UTC';

ALTER TABLE teacher_profiles
  ADD COLUMN IF NOT EXISTS time_zone text NOT NULL DEFAULT 'UTC',
  ADD COLUMN IF NOT EXISTS credential_verified boolean NOT NULL DEFAULT false;

-- Preserve legacy fixed-offset behavior as a starting point until each user chooses an IANA zone.
UPDATE teacher_profiles
SET time_zone = CASE
  WHEN tz_offset = 9 THEN 'Asia/Tokyo'
  WHEN tz_offset = 8 THEN 'Asia/Shanghai'
  WHEN tz_offset = 0 THEN 'UTC'
  WHEN tz_offset BETWEEN -12 AND 14 THEN 'Etc/GMT' || CASE WHEN tz_offset = 0 THEN '' WHEN tz_offset > 0 THEN '-' || tz_offset::text ELSE '+' || abs(tz_offset)::text END
  ELSE 'UTC'
END
WHERE time_zone = 'UTC' AND tz_offset <> 0;

ALTER TABLE payouts
  ADD COLUMN IF NOT EXISTS reviewed_by integer REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS reviewed_at timestamp,
  ADD COLUMN IF NOT EXISTS provider_reference text NOT NULL DEFAULT '';

ALTER TABLE classroom_workspace_states
  ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id serial PRIMARY KEY,
  admin_id integer NOT NULL REFERENCES users(id),
  target_user_id integer REFERENCES users(id),
  action text NOT NULL,
  amount integer NOT NULL DEFAULT 0,
  balance_before integer,
  balance_after integer,
  reference text NOT NULL DEFAULT '',
  note text NOT NULL DEFAULT '',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_audit_admin_idx ON admin_audit_logs(admin_id, created_at);
CREATE INDEX IF NOT EXISTS admin_audit_target_idx ON admin_audit_logs(target_user_id, created_at);
CREATE INDEX IF NOT EXISTS admin_audit_action_idx ON admin_audit_logs(action, created_at);

CREATE TABLE IF NOT EXISTS auth_action_tokens (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamp NOT NULL,
  consumed_at timestamp,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS auth_tokens_user_purpose_idx ON auth_action_tokens(user_id, purpose);
CREATE INDEX IF NOT EXISTS auth_tokens_expiry_idx ON auth_action_tokens(expires_at);

-- Identity verification remains separate; only optional academic/teaching credentials
-- can activate the public credentialVerified badge.
UPDATE teacher_profiles tp SET credential_verified = EXISTS (
  SELECT 1 FROM teacher_documents td
  WHERE td.teacher_id = tp.user_id AND td.optional_credential = true AND td.status = 'verified'
);
