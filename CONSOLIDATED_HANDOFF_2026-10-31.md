# Lingorain consolidated handoff — 2026-10-31

This package consolidates the current project source and the latest requested corrections.

## Included in this consolidation
- Booking lead time is 30 minutes in the shared slot-generation and server-side booking validation logic (`src/lib/time.ts`). The same guard applies to private and semi-private bookings through `reserveLesson`. The cutoff is minute-granular: at 09:30, a 10:00 slot remains bookable; from 09:31 it is hidden/rejected.
- Existing semi-private/group slots are filtered against the same 30-minute cutoff before being shown.
- Public teacher schedule copy no longer displays the teacher's timezone/location label. Student-facing slot times continue to be rendered in the student's configured timezone.
- Countdown display is anchored to the server timestamp and elapsed client time; the in-room remaining-time value uses the same server-clock estimate rather than the device wall clock.
- Teacher dashboard demo copy is English. LingoRoom Demo includes a local-only practice panel for whiteboard notes, simulated chat, and sample textbook/audio selection. Demo content is not sent to a real lesson or database.
- Existing real classroom workspace remains inside the classroom flow, including shared textbook/PDF/audio selection, whiteboard and class chat/tooling.

## Important verification notes
- ZIP integrity is checked after packaging.
- A full Next.js build/typecheck was not completed in this environment because project dependencies (`node_modules`) are not installed. The attempted global TypeScript check therefore reports missing Next.js, React, Drizzle, and Node type packages; these are environment/dependency errors and do not establish a successful build.
- No database schema or migration was added by this consolidation.
- Before production deployment, install dependencies from the lockfile and run `npm run typecheck`, `npm run build`, and the project's relevant booking/classroom tests. Then verify a booking at 29 minutes is rejected and one at exactly 30 minutes is accepted, subject to slot availability.
