CREATE TABLE IF NOT EXISTS scheduled_job_runs (
  id serial PRIMARY KEY,
  job text NOT NULL,
  status text NOT NULL DEFAULT 'running',
  started_at timestamp NOT NULL DEFAULT now(),
  finished_at timestamp,
  duration_ms integer,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS scheduled_job_name_started_idx ON scheduled_job_runs(job, started_at);
CREATE INDEX IF NOT EXISTS scheduled_job_status_started_idx ON scheduled_job_runs(status, started_at);
