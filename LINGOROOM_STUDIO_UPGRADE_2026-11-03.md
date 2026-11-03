# LingoRoom Studio Upgrade — 2026-11-03

This update is applied on top of `Lingorain-Final-Booking-Fix-2026-11-03.zip`.

## Classroom experience
- Replaced the bare Jitsi iframe with the Jitsi IFrame API mounted inside the Lingorain classroom shell.
- Added Lingorain Studio styling for the pre-join and live-room views while keeping the site's teal/emerald visual language.
- Added first-party controls for microphone, camera, screen sharing, hand raise, captions, tile layout, fullscreen, and leave.
- Added connection feedback, live participant list/count, screen-share status, lesson timer, and a dedicated classroom workspace sidebar.
- Added a full-width whiteboard view so the board is not trapped in the narrow side panel.
- Extended the teacher demo with a local-only drawing canvas and local screen-selection preview; it does not join or alter a real lesson.

## Shared whiteboard
- Added pen colors, highlighter, eraser, teacher-only undo and clear controls, and a subtle grid-paper canvas.
- Enabled students as well as teachers to add marks to the board.
- Kept student writes append-only at the API boundary: students cannot clear or replace existing shared strokes, and cannot change the teacher-controlled book, page, audio, prompt, or feedback fields.
- Extended workspace stroke validation for safe color and width values and a 300-stroke ceiling.
- No new database migration is required; this uses the existing per-lesson workspace state.

## Security and deployment notes
- Content Security Policy and Permissions Policy now allow the Jitsi IFrame API script and embedded meeting surface for the supported Jitsi hosts. If a custom Jitsi host is used, set `JITSI_DOMAIN` in the deployment environment to the same hostname configured in Admin → Integrations so the browser policy permits the API script and iframe.
- The public `meet.jit.si` endpoint is suitable for testing, but Jitsi says it is not intended for production applications. Configure a managed Jitsi as a Service plan or a controlled self-hosted Jitsi deployment before treating this classroom as a production-grade private video service.
- Screen sharing is started through the Jitsi IFrame API after a direct user click; the browser still displays its native screen/window selection and permission UI.

## Verification status
- ZIP archive integrity checked after packaging.
- TypeScript/TSX syntax transpilation checked for the changed files.
- Full `npm run typecheck` and `npm run build` were not completed: `npm ci --ignore-scripts --no-audit --no-fund` timed out in this environment before dependency installation completed. Run both commands locally before pushing/deploying.
