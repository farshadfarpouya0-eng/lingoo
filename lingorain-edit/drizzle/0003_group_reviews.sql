-- Allow every verified student in a semi-private class to leave one review.
-- Private lessons retain one review naturally because only one student can access it.
ALTER TABLE reviews DROP CONSTRAINT IF EXISTS reviews_lesson_id_unique;
ALTER TABLE reviews DROP CONSTRAINT IF EXISTS reviews_lesson_id_key;
DROP INDEX IF EXISTS reviews_lesson_id_unique;
CREATE UNIQUE INDEX IF NOT EXISTS reviews_lesson_student_unique ON reviews(lesson_id, student_id);
