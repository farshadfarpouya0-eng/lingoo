-- Placement matching: students take a written test or a free live speaking assessment,
-- then get matched with a short list of teachers instead of browsing everyone. Additive only.
ALTER TABLE teacher_profiles ADD COLUMN IF NOT EXISTS levels text NOT NULL DEFAULT '';
ALTER TABLE teacher_profiles ADD COLUMN IF NOT EXISTS intro_video_url text NOT NULL DEFAULT '';
ALTER TABLE teacher_profiles ADD COLUMN IF NOT EXISTS sample_video_url text NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS assessments (
  id serial PRIMARY KEY,
  student_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  method text NOT NULL DEFAULT 'written',
  status text NOT NULL DEFAULT 'pending',
  goal text NOT NULL DEFAULT '',
  audience text NOT NULL DEFAULT 'adults',
  score integer,
  level text,
  answers jsonb,
  assigned_teacher_id integer REFERENCES users(id),
  scheduled_at timestamptz,
  lesson_id integer REFERENCES lessons(id),
  recommended_ids jsonb,
  selected_teacher_id integer REFERENCES users(id),
  teacher_notes text NOT NULL DEFAULT '',
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS assessments_student_idx ON assessments(student_id, created_at);
CREATE INDEX IF NOT EXISTS assessments_teacher_idx ON assessments(assigned_teacher_id, status);
