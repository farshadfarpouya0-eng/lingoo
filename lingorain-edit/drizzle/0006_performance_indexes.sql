-- Performance indexes for the hottest queries.
CREATE INDEX IF NOT EXISTS idx_lessons_student_start  ON lessons (student_id, start_at DESC);
CREATE INDEX IF NOT EXISTS idx_lessons_teacher_start  ON lessons (teacher_id, start_at DESC);
CREATE INDEX IF NOT EXISTS idx_lessons_status_start   ON lessons (status, start_at);
CREATE INDEX IF NOT EXISTS idx_lessons_package        ON lessons (package_id) WHERE package_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sessions_user          ON sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires       ON sessions (expires_at);
CREATE INDEX IF NOT EXISTS idx_transactions_user      ON transactions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_ref       ON transactions (ref);
CREATE INDEX IF NOT EXISTS idx_transactions_lesson    ON transactions (lesson_id);
CREATE INDEX IF NOT EXISTS idx_lesson_participants_st ON lesson_participants (student_id, status);
CREATE INDEX IF NOT EXISTS idx_lesson_participants_l  ON lesson_participants (lesson_id, status);
CREATE INDEX IF NOT EXISTS idx_messages_pair          ON messages (from_id, to_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_lesson            ON lesson_chat_messages (lesson_id, created_at);
CREATE INDEX IF NOT EXISTS idx_reviews_teacher        ON reviews (teacher_id, rating);
CREATE INDEX IF NOT EXISTS idx_teacher_profiles_act   ON teacher_profiles (active, rating DESC);
CREATE INDEX IF NOT EXISTS idx_accounting_account     ON accounting_entries (account_code, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_accounting_tx          ON accounting_entries (transaction_id);