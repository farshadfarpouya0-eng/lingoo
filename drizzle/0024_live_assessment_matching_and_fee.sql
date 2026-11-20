-- Mark free live placement evaluations explicitly so the configured assessment fee is used.
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS placement_assessment boolean NOT NULL DEFAULT false;
