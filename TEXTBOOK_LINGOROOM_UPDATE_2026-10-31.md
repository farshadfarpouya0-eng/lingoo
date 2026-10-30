# Textbook / LingoRoom update — 2026-10-31

- Admin textbook metadata stores an optional validated PDF page count.
- Teachers can jump directly to a PDF page; navigation is bounded when a page count is supplied.
- Teachers can navigate lesson units; students follow the shared lesson selection.
- Lesson images are served through the authorized private-material asset endpoint.
- Audio remains teacher-controlled and synchronized to students through shared classroom state.
- Existing teacher-only class readiness panel and consolidated project changes are retained.

No database schema migration was added; page count is stored in the existing JSON material metadata.
