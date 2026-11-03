-- Group lessons allow one review per (lesson, student). Older databases may still carry the
-- one-review-per-lesson constraint. Migration 0003 was edited after some databases had
-- already applied it, so this repeats the drop as its own idempotent step.
ALTER TABLE reviews DROP CONSTRAINT IF EXISTS reviews_lesson_id_unique;
