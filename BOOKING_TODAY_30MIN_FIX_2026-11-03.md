# Booking availability correction — 2026-11-03

- Availability generation and server-side booking validation share `isBookingLeadTimeOpen` from `src/lib/time.ts`.
- The 30-minute rule preserves the previously agreed minute boundary: a 10:00 class is allowed through 09:30 and closes at 09:31. Private and semi-private booking requests are checked again inside `reserveLesson`.
- The student booking panel refreshes the visible slots every 10 seconds and disables a selected time when its cutoff passes.
- Day groups remain keyed to the teacher timetable's local calendar date. Each day selector also shows the matching date in the student's configured timezone, clarifying classes that cross midnight for the student.
- Public teacher schedule labels do not disclose the teacher's IANA timezone; times are identified only as teacher-local time.
- No new DB migration is added by this correction. Ensure the existing `0016_timezone_safe_lesson_instants.sql` has been applied if it is outstanding; back up Neon first and verify its UTC interpretation assumption.

Build/typecheck was not verified in this environment because dependency installation could not complete (npm registry DNS requests failed).
