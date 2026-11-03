CREATE TABLE IF NOT EXISTS classroom_workspace_states (
  lesson_id integer PRIMARY KEY REFERENCES lessons(id) ON DELETE CASCADE,
  state jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by integer NOT NULL REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS classroom_workspace_updated_idx ON classroom_workspace_states(updated_at);
