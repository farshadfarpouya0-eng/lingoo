# Classroom changes — 2026-10-29

- Server-side access remains role-specific: teachers can enter from 30 minutes before start; students from 10 minutes before start. This is enforced by `roomState()` in `src/lib/room-service.ts`.
- Countdown rounding was adjusted to avoid showing the room as opening early due to rounding down the remaining minutes.
- Removed Daily Room from new classroom choices and test-lesson choices; server-side save actions reject new Daily selections. Existing lessons already configured for Daily are preserved and their existing Daily join path is retained to avoid breaking booked sessions.
- Daily recording integration files/settings are retained because they support existing recording infrastructure, not just the classroom picker.
