-- Timestamp claims allow the recording cleanup job to recover safely if a
-- serverless invocation crashes while a Daily stop request is in flight.
ALTER TABLE lesson_recordings
  ADD COLUMN IF NOT EXISTS updated_at timestamp NOT NULL DEFAULT now();

UPDATE lesson_recordings SET updated_at = created_at WHERE updated_at IS NULL;
