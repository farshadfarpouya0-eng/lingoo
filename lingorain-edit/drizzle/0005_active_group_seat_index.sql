-- Allow a student who was refunded/cancelled to rejoin a semi-private class.
-- Existing rows with an active status remain unique; cancelled/refunded rows do not.
DROP INDEX IF EXISTS lesson_participant_active_unique;
CREATE UNIQUE INDEX lesson_participant_active_unique
  ON lesson_participants(lesson_id, student_id)
  WHERE status IN ('booked', 'attended');
