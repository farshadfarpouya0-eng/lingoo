-- Lingorain feature migration (PostgreSQL / Drizzle).
-- Take a database backup and run in staging first. Do not run through a build hook.

ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_storage_ref text;
CREATE UNIQUE INDEX IF NOT EXISTS users_referral_code_unique ON users(referral_code);

ALTER TABLE lessons ADD COLUMN IF NOT EXISTS class_type text NOT NULL DEFAULT 'private';
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS capacity integer NOT NULL DEFAULT 1;
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS reward_credit_id integer;

CREATE TABLE IF NOT EXISTS learning_materials (
  id serial PRIMARY KEY,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  kind text NOT NULL DEFAULT 'textbook',
  language text NOT NULL DEFAULT 'English',
  level text NOT NULL DEFAULT 'A1',
  file_url text NOT NULL,
  cover_url text NOT NULL DEFAULT '',
  is_free boolean NOT NULL DEFAULT true,
  price integer NOT NULL DEFAULT 0,
  published boolean NOT NULL DEFAULT false,
  created_by integer REFERENCES users(id),
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS materials_published_idx ON learning_materials(published, kind);

CREATE TABLE IF NOT EXISTS material_purchases (
  id serial PRIMARY KEY,
  material_id integer NOT NULL REFERENCES learning_materials(id),
  user_id integer NOT NULL REFERENCES users(id),
  amount integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'paid',
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS material_purchase_unique ON material_purchases(material_id, user_id);
CREATE INDEX IF NOT EXISTS material_purchase_user_idx ON material_purchases(user_id);

CREATE TABLE IF NOT EXISTS lesson_reports (
  id serial PRIMARY KEY,
  lesson_id integer NOT NULL REFERENCES lessons(id),
  reporter_id integer NOT NULL REFERENCES users(id),
  category text NOT NULL,
  description text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  resolution text NOT NULL DEFAULT '',
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lesson_reports_status_idx ON lesson_reports(status, created_at);

CREATE TABLE IF NOT EXISTS referrals (
  id serial PRIMARY KEY,
  referrer_id integer NOT NULL REFERENCES users(id),
  referred_user_id integer NOT NULL UNIQUE REFERENCES users(id),
  code text NOT NULL,
  status text NOT NULL DEFAULT 'registered',
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS referrals_referrer_idx ON referrals(referrer_id, status);

CREATE TABLE IF NOT EXISTS referral_rewards (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id),
  reward_type text NOT NULL,
  lessons_granted integer NOT NULL,
  duration integer NOT NULL,
  status text NOT NULL DEFAULT 'available',
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS referral_rewards_user_idx ON referral_rewards(user_id);

CREATE TABLE IF NOT EXISTS referral_lesson_credits (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  duration integer NOT NULL CHECK (duration IN (25, 50)),
  remaining_lessons integer NOT NULL DEFAULT 0 CHECK (remaining_lessons >= 0),
  source_reward_id integer NOT NULL UNIQUE REFERENCES referral_rewards(id) ON DELETE CASCADE,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS referral_credits_user_idx ON referral_lesson_credits(user_id, duration);

CREATE TABLE IF NOT EXISTS teacher_documents (
  id serial PRIMARY KEY,
  teacher_id integer NOT NULL REFERENCES users(id),
  document_type text NOT NULL,
  file_url text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  optional_credential boolean NOT NULL DEFAULT false,
  created_at timestamp NOT NULL DEFAULT now(),
  reviewed_at timestamp
);
CREATE INDEX IF NOT EXISTS teacher_documents_user_idx ON teacher_documents(teacher_id, status);

CREATE TABLE IF NOT EXISTS lesson_chat_messages (
  id serial PRIMARY KEY,
  lesson_id integer NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  sender_id integer NOT NULL REFERENCES users(id),
  body text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lesson_chat_lesson_idx ON lesson_chat_messages(lesson_id, created_at);

CREATE TABLE IF NOT EXISTS lesson_recordings (
  id serial PRIMARY KEY,
  lesson_id integer NOT NULL UNIQUE REFERENCES lessons(id) ON DELETE CASCADE,
  file_url text NOT NULL,
  expires_at timestamp NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS recordings_expiry_idx ON lesson_recordings(expires_at);

CREATE TABLE IF NOT EXISTS lesson_reminder_logs (
  id serial PRIMARY KEY,
  lesson_id integer NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  recipient_id integer NOT NULL REFERENCES users(id),
  minutes_before integer NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  sent_at timestamp,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS reminder_once_unique ON lesson_reminder_logs(lesson_id, recipient_id, minutes_before);

CREATE TABLE IF NOT EXISTS user_presence (
  user_id integer PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  last_seen_at timestamp NOT NULL DEFAULT now(),
  online boolean NOT NULL DEFAULT false
);
ALTER TABLE user_presence ADD COLUMN IF NOT EXISTS visible boolean NOT NULL DEFAULT true;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lessons_reward_credit_id_fk') THEN
    ALTER TABLE lessons ADD CONSTRAINT lessons_reward_credit_id_fk FOREIGN KEY (reward_credit_id) REFERENCES referral_lesson_credits(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lessons_class_type_check') THEN
    ALTER TABLE lessons ADD CONSTRAINT lessons_class_type_check CHECK (class_type IN ('private', 'semi_private'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lessons_capacity_check') THEN
    ALTER TABLE lessons ADD CONSTRAINT lessons_capacity_check CHECK (capacity BETWEEN 1 AND 4);
  END IF;
END $$;
