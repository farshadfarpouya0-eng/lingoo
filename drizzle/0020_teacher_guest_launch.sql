-- Admin-managed no-login teacher launch for external rooms. Additive only.
ALTER TABLE teacher_profiles ADD COLUMN IF NOT EXISTS meet_open_access boolean NOT NULL DEFAULT false;
ALTER TABLE teacher_profiles ADD COLUMN IF NOT EXISTS zoom_host_url text NOT NULL DEFAULT '';
