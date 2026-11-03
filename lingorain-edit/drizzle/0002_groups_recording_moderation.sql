-- Semi-private seat membership, recording consent/metadata, and moderation appeals.
-- Run using `npm run db:migrate` after testing against a backup/staging database.

CREATE TABLE IF NOT EXISTS lesson_participants (
  id serial PRIMARY KEY,
  lesson_id integer NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  student_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  paid_amount integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'booked' CHECK (status IN ('booked','attended','cancelled','refunded')),
  created_at timestamp NOT NULL DEFAULT now(),
  cancelled_at timestamp
);
CREATE UNIQUE INDEX IF NOT EXISTS lesson_participant_active_unique
  ON lesson_participants(lesson_id, student_id) WHERE status IN ('booked', 'attended');
CREATE INDEX IF NOT EXISTS lesson_participants_student_idx ON lesson_participants(student_id, status);
CREATE INDEX IF NOT EXISTS lesson_participants_lesson_idx ON lesson_participants(lesson_id, status);

-- Existing semi-private lesson rows (if any) treat their original student as enrolled.
INSERT INTO lesson_participants(lesson_id, student_id, paid_amount, status, created_at)
SELECT id, student_id, price, CASE WHEN status = 'completed' THEN 'attended' ELSE 'booked' END, created_at
FROM lessons WHERE class_type = 'semi_private'
ON CONFLICT DO NOTHING;

ALTER TABLE lesson_recordings ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'daily';
ALTER TABLE lesson_recordings ADD COLUMN IF NOT EXISTS provider_recording_id text NOT NULL DEFAULT '';
ALTER TABLE lesson_recordings ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'processing';
ALTER TABLE lesson_recordings ALTER COLUMN file_url SET DEFAULT '';
CREATE INDEX IF NOT EXISTS recordings_status_idx ON lesson_recordings(status);

CREATE TABLE IF NOT EXISTS lesson_recording_consents (
  id serial PRIMARY KEY,
  lesson_id integer NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  consented boolean NOT NULL DEFAULT false,
  consented_at timestamp,
  updated_at timestamp NOT NULL DEFAULT now(),
  UNIQUE(lesson_id, user_id)
);
CREATE INDEX IF NOT EXISTS lesson_recording_consent_user_idx ON lesson_recording_consents(user_id);

CREATE TABLE IF NOT EXISTS moderation_cases (
  id serial PRIMARY KEY,
  lesson_id integer REFERENCES lessons(id) ON DELETE SET NULL,
  reporter_id integer NOT NULL REFERENCES users(id),
  subject_user_id integer REFERENCES users(id),
  category text NOT NULL,
  description text NOT NULL,
  evidence_ref text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'open',
  resolution text NOT NULL DEFAULT '',
  appeal_text text NOT NULL DEFAULT '',
  created_at timestamp NOT NULL DEFAULT now(),
  resolved_at timestamp
);
CREATE INDEX IF NOT EXISTS moderation_cases_status_idx ON moderation_cases(status, created_at);
CREATE INDEX IF NOT EXISTS moderation_cases_subject_idx ON moderation_cases(subject_user_id);
