# LingoRoom Admin Materials — 2026-11-04

## What changed

- The live classroom material catalogue now loads every **published** row from `learning_materials` with title, kind, category, language, level, cover, description and structured lesson data.
- Teachers can search and filter the published Admin catalogue by textbook, audio course or interactive worksheet, then select an item for the current live lesson.
- The live workspace renders the selected PDF with shared page navigation, lesson text, lesson images and private audio tracks. Audio controls are available on both sides; teacher playback state and position continue to synchronize through the existing shared classroom workspace.
- The classroom server sends the full catalogue only to the teacher. Students receive only the currently selected material; if the teacher changes it mid-class, the student fetches that single selected item from an authenticated lesson-scoped endpoint. Selection and page/audio control remain teacher-led.
- Older single-file private PDF/audio material records are supported as a fallback, in addition to the current structured JSON course records.
- The teacher's **LingoRoom Demo** no longer uses hard-coded sample book names. It loads the real published Admin materials and previews PDF, lesson text, images and audio in an isolated, local-only demo.
- Added `/api/private-files/material/[id]/preview` for the teacher-only demo. It serves only published private materials, does not require or modify a real lesson, and refuses unrecognized/external file references.

## Admin workflow

1. Open **Admin → Materials**.
2. Upload the PDF, lesson text, unit images and/or audio tracks.
3. Save the material and make sure **Published** is enabled.
4. The item then appears in the teacher's LingoRoom library and in LingoRoom Demo.
5. Draft/unpublished materials deliberately remain unavailable to teachers until an administrator publishes them.

## Data and deployment notes

- No database schema migration was added.
- Assets continue to be served from private storage. The live classroom endpoint retains its lesson-access and selected-material checks.
- The Demo preview endpoint is restricted to authenticated teacher accounts and published materials; it does not persist demo selection or lesson progress.
- Full `npm run typecheck` / `npm run build` could not be completed in this environment because dependency installation did not finish (npm registry/cache dependency unavailable). Changed TS/TSX files were syntax-transpiled successfully with the available TypeScript compiler API.
