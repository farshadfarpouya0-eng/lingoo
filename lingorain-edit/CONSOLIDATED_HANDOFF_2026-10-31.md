# Lingorain consolidated handoff — 2026-10-31

This package consolidates the current project source and the latest requested corrections.

## Included in this consolidation
- Booking lead time is 30 minutes in the shared slot-generation and server-side booking validation logic (`src/lib/time.ts`). The same guard applies to private and semi-private bookings through `reserveLesson`. The agreed minute-level cutoff is preserved: a 10:00 slot remains bookable through 09:30 and is hidden/rejected from 09:31.
- Existing semi-private/group slots use the same cutoff. The student booking panel refreshes the list every 10 seconds so slots are removed when their booking window closes, and it disables a selected slot as soon as it expires.
- Availability days remain grouped by the teacher’s timetable date. Each day chip also shows the corresponding date in the student’s timezone, so a cross-midnight conversion is clear without losing a late-evening teacher slot. Public labels say “Teacher local time” and do not expose the teacher’s timezone/location.
- Public teacher schedule copy no longer displays the teacher's timezone/location label. Student-facing slot times continue to be rendered in the student's configured timezone.
- Countdown display is anchored to the server timestamp and elapsed client time; the in-room remaining-time value uses the same server-clock estimate rather than the device wall clock.
- Teacher dashboard demo copy is English. LingoRoom Demo includes a local-only practice panel for whiteboard notes, simulated chat, and sample textbook/audio selection. Demo content is not sent to a real lesson or database.
- Existing real classroom workspace remains inside the classroom flow, including shared textbook/PDF/audio selection, whiteboard and class chat/tooling.

## Important verification notes
- ZIP integrity is checked after packaging.
- A full Next.js build/typecheck was not completed in this environment because project dependencies (`node_modules`) are not installed. The attempted global TypeScript check therefore reports missing Next.js, React, Drizzle, and Node type packages; these are environment/dependency errors and do not establish a successful build.
- No new database schema or migration is added by this booking-window correction. Existing migration `0016_timezone_safe_lesson_instants.sql` is included in the project and must be applied if it is still outstanding; it converts legacy lesson/blocked-slot timestamps to absolute instants and normalizes the teacher timezone configuration. Back up Neon before applying it.
- Before production deployment, install dependencies from the lockfile and run `npm run typecheck`, `npm run build`, and the project's relevant booking/classroom tests. Then verify a booking at 29 minutes is rejected, one at exactly 30 minutes is accepted, and a 10:00 p.m. teacher-local slot remains visible on the teacher’s current timetable date until the cutoff, subject to slot availability.
