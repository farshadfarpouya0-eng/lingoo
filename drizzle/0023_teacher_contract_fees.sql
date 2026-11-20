-- Admin-controlled contract pay per completed lesson (cents). Null = platform default fee.
ALTER TABLE teacher_profiles ADD COLUMN IF NOT EXISTS fee_25 integer;
ALTER TABLE teacher_profiles ADD COLUMN IF NOT EXISTS fee_50 integer;
