-- Store booked lesson and blocked-slot times as absolute UTC instants.
-- Legacy timestamp-without-time-zone values were written from ISO UTC instants;
-- interpret their existing wall-clock values as UTC when converting.
ALTER TABLE lessons
  ALTER COLUMN start_at TYPE timestamptz
  USING start_at AT TIME ZONE 'UTC';

ALTER TABLE teacher_blocked_slots
  ALTER COLUMN start_at TYPE timestamptz
  USING start_at AT TIME ZONE 'UTC',
  ALTER COLUMN end_at TYPE timestamptz
  USING end_at AT TIME ZONE 'UTC';

-- Lingorain's active teachers are based in Iran; keep student-selected zones intact.
UPDATE teacher_profiles SET time_zone = 'Asia/Tehran';
UPDATE users SET time_zone = 'Asia/Tehran' WHERE role = 'teacher';

-- Existing Japanese- and Chinese-language student accounts that still have the
-- legacy UTC default receive their expected local zone. Explicit custom zones stay untouched.
UPDATE users SET time_zone = 'Asia/Tokyo'
WHERE role = 'student' AND native_lang = 'ja' AND time_zone = 'UTC';
UPDATE users SET time_zone = 'Asia/Shanghai'
WHERE role = 'student' AND native_lang = 'zh' AND time_zone = 'UTC';
