-- Versioned baseline schema for Lingorain's core booking and payment ledger.
-- The follow-up 0001 migration adds the extended learning-platform features.
-- Idempotent DDL permits safe adoption by installations whose core tables already exist.

CREATE TABLE IF NOT EXISTS site_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS site_settings_key_idx ON site_settings(key);

CREATE TABLE IF NOT EXISTS users (
  id serial PRIMARY KEY,
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  role text NOT NULL DEFAULT 'student',
  avatar text,
  native_lang text DEFAULT 'zh',
  level text DEFAULT 'A1',
  balance integer NOT NULL DEFAULT 0,
  suspended boolean NOT NULL DEFAULT false,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  id text PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamp NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);

CREATE TABLE IF NOT EXISTS teacher_profiles (
  user_id integer PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  headline text NOT NULL DEFAULT '',
  bio text NOT NULL DEFAULT '',
  country text NOT NULL DEFAULT 'US',
  accent text NOT NULL DEFAULT 'American',
  price integer NOT NULL DEFAULT 2500,
  rating real NOT NULL DEFAULT 5,
  reviews_count integer NOT NULL DEFAULT 0,
  lessons_count integer NOT NULL DEFAULT 0,
  speaks text NOT NULL DEFAULT 'English',
  tags text NOT NULL DEFAULT '',
  certified boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  start_hour integer NOT NULL DEFAULT 9,
  end_hour integer NOT NULL DEFAULT 21,
  tz_offset integer NOT NULL DEFAULT 8,
  work_days text NOT NULL DEFAULT '0,1,2,3,4,5,6',
  platform_default text NOT NULL DEFAULT 'lingo',
  payout_method text NOT NULL DEFAULT '',
  payout_account text NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS tp_active_rating_idx ON teacher_profiles(active, rating);

CREATE TABLE IF NOT EXISTS lesson_packages (
  id serial PRIMARY KEY,
  student_id integer NOT NULL REFERENCES users(id),
  teacher_id integer NOT NULL REFERENCES users(id),
  duration integer NOT NULL,
  total_lessons integer NOT NULL,
  remaining_lessons integer NOT NULL,
  unit_price integer NOT NULL,
  original_unit_price integer NOT NULL,
  discount_percent integer NOT NULL,
  total_price integer NOT NULL,
  purchase_key text NOT NULL UNIQUE,
  created_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT packages_remaining_check CHECK (remaining_lessons >= 0 AND remaining_lessons <= total_lessons),
  CONSTRAINT packages_duration_check CHECK (duration IN (25,50))
);
CREATE INDEX IF NOT EXISTS packages_student_tutor_idx ON lesson_packages(student_id, teacher_id);

CREATE TABLE IF NOT EXISTS lessons (
  id serial PRIMARY KEY,
  student_id integer NOT NULL REFERENCES users(id),
  teacher_id integer NOT NULL REFERENCES users(id),
  start_at timestamptz NOT NULL,
  duration integer NOT NULL DEFAULT 50,
  status text NOT NULL DEFAULT 'pending',
  price integer NOT NULL,
  trial boolean NOT NULL DEFAULT false,
  topic text NOT NULL DEFAULT '',
  teacher_notes text NOT NULL DEFAULT '',
  reviewed boolean NOT NULL DEFAULT false,
  package_id integer REFERENCES lesson_packages(id),
  platform text NOT NULL DEFAULT 'undecided',
  meeting_url text NOT NULL DEFAULT '',
  platform_revision integer NOT NULL DEFAULT 0,
  platform_updated_at timestamp,
  platform_issue_at timestamp,
  platform_issue_by integer REFERENCES users(id),
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lessons_student_idx ON lessons(student_id, start_at);
CREATE INDEX IF NOT EXISTS lessons_teacher_idx ON lessons(teacher_id, start_at);
CREATE INDEX IF NOT EXISTS lessons_platform_idx ON lessons(platform);
CREATE UNIQUE INDEX IF NOT EXISTS lessons_slot_unique ON lessons(teacher_id, start_at) WHERE status <> 'cancelled';

CREATE TABLE IF NOT EXISTS teacher_weekly_slots (
  id serial PRIMARY KEY,
  teacher_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  weekday integer NOT NULL CHECK (weekday >= 0 AND weekday <= 6),
  start_minute integer NOT NULL CHECK (start_minute >= 0),
  end_minute integer NOT NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT weekly_slots_range_check CHECK (weekday >= 0 AND weekday <= 6 AND start_minute >= 0 AND start_minute < end_minute AND end_minute <= 1440)
);
CREATE INDEX IF NOT EXISTS weekly_slots_teacher_idx ON teacher_weekly_slots(teacher_id, weekday);

CREATE TABLE IF NOT EXISTS teacher_blocked_slots (
  id serial PRIMARY KEY,
  teacher_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  reason text NOT NULL DEFAULT '',
  created_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT blocked_slots_range_check CHECK (end_at > start_at)
);
CREATE INDEX IF NOT EXISTS blocked_slots_teacher_idx ON teacher_blocked_slots(teacher_id, start_at);

CREATE TABLE IF NOT EXISTS lesson_platform_events (
  id serial PRIMARY KEY,
  lesson_id integer NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  changed_by integer NOT NULL REFERENCES users(id),
  from_platform text NOT NULL,
  to_platform text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS platform_events_lesson_idx ON lesson_platform_events(lesson_id);

CREATE TABLE IF NOT EXISTS reviews (
  id serial PRIMARY KEY,
  lesson_id integer UNIQUE,
  student_id integer NOT NULL REFERENCES users(id),
  teacher_id integer NOT NULL REFERENCES users(id),
  rating integer NOT NULL,
  comment text NOT NULL DEFAULT '',
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS reviews_teacher_idx ON reviews(teacher_id, created_at);

CREATE TABLE IF NOT EXISTS messages (
  id serial PRIMARY KEY,
  from_id integer NOT NULL REFERENCES users(id),
  to_id integer NOT NULL REFERENCES users(id),
  body text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS messages_from_idx ON messages(from_id);
CREATE INDEX IF NOT EXISTS messages_to_idx ON messages(to_id);

CREATE TABLE IF NOT EXISTS transactions (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id),
  type text NOT NULL,
  amount integer NOT NULL,
  lesson_id integer,
  ref text UNIQUE,
  note text NOT NULL DEFAULT '',
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tx_user_idx ON transactions(user_id, created_at);

CREATE TABLE IF NOT EXISTS payouts (
  id serial PRIMARY KEY,
  teacher_id integer NOT NULL REFERENCES users(id),
  amount integer NOT NULL,
  method text NOT NULL,
  account text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  note text NOT NULL DEFAULT '',
  created_at timestamp NOT NULL DEFAULT now(),
  processed_at timestamp
);
CREATE INDEX IF NOT EXISTS payouts_teacher_idx ON payouts(teacher_id);
CREATE INDEX IF NOT EXISTS payouts_status_idx ON payouts(status);
