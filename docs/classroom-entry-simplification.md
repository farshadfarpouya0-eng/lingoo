# Classroom entry — tutor-only selection, one-click student join

- The tutor chooses only LingoRoom, Google Meet, or Zoom. Both classroom server actions and the room service reject new `daily` selections (including direct calls to old actions). Students cannot choose any platform.
- Students arriving from Dashboard during their confirmed, eligible lesson window use **Enter classroom** once. For LingoRoom, the authenticated classroom loads and joins the configured provider automatically; for Meet/Zoom, the browser navigates in the same tab to the validated join URL (no blocked popup). Opening the classroom page directly still shows one Enter button.
- Before the 10-minute student entry window or before a tutor chooses a room, the dashboard opens the status page instead of triggering a join. The server independently enforces lesson membership and the entry window.
- The inline Report button was removed. The existing help/report tools remain available in a collapsed "Need help?" section.
- Daily is no longer offered in the classroom picker or admin integration UI. **Existing Daily lessons and recordings are preserved.** A previously scheduled Daily lesson shows an explicit one-button legacy entry option rather than silently being canceled; retention/cleanup remains active. Existing Daily setup must not be deleted until outstanding classes and recordings have been handled.
- No new database migration is required for this UI and policy change. Existing production migration requirements still apply.
