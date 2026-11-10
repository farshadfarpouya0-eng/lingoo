-- Admin-managed fixed Google Meet / Zoom rooms per tutor. Additive only; no data is changed.
ALTER TABLE teacher_profiles ADD COLUMN IF NOT EXISTS meet_url text NOT NULL DEFAULT '';
ALTER TABLE teacher_profiles ADD COLUMN IF NOT EXISTS zoom_url text NOT NULL DEFAULT '';
