# Lingorain Teaching Studio — implementation notes

## Included in this version

- Private PDF asset is stored as `pdfRef` in the existing learning-material `fileUrl` JSON payload; the asset endpoint retains authentication, publication and purchase checks.
- The classroom workspace shows the PDF reader, lesson text and private audio, plus a whiteboard and shared practice prompt/answer/teacher feedback.
- Classroom workspace state is persisted per lesson in `classroom_workspace_states` and is shared between authorized participants by authenticated polling. It includes selected book/page/unit, audio play state/time, board strokes and practice text.
- Workspace API validates payload sizes and coordinates, rate-limits reads/writes, checks lesson membership and the classroom access window, and does not allow students to overwrite teacher question/feedback when a previous state exists.
- Migration added: `drizzle/0008_classroom_workspace_state.sql`.

## Database migration

Back up the database first. Then, in a controlled release environment with the intended `DATABASE_URL` or `DATABASE_DIRECT_URL` configured:

```bash
npm run db:migrate
```

The migration runner refuses hosted database changes unless `ALLOW_PRODUCTION_MIGRATIONS=true` is explicitly set. Only set that flag after confirming the target database and backup.

## Verification still required

- Install dependencies from the lockfile (`npm ci`) in a complete Node environment.
- Run `npm run typecheck`, `npm run lint`, and `npm run build`.
- Test teacher/student access with free and paid materials, the PDF streaming route, audio playback, page/track synchronization, board save/load, concurrent edits, class-window restrictions, and the migration against a staging database.
- This implementation uses authenticated polling rather than a dedicated websocket collaboration service. It is suitable as a first shared-state layer, but updates are not instantaneous and simultaneous board edits may overwrite each other. A true collaborative canvas and a separately persisted learning-progress/gradebook system remain future work.
