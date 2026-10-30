# Lingorain implementation — phase 3 (2026-10-30)

## Scope
Classroom provider ownership and booking/classroom status clarity, preserving the existing theme and existing classroom implementation.

## Changes
- LingoRoom is now the default provider for newly created private and group lessons.
- Legacy lessons whose provider is `undecided` resolve to LingoRoom in the room snapshot without requiring a database migration.
- Provider selection UI is rendered only for the teacher; students no longer see provider cards or a provider selection form.
- Server action now strictly requires the authenticated lesson teacher with the teacher role to change the provider. Students can report a classroom problem but cannot write a provider choice.
- Teacher provider options are LingoRoom, Google Meet and Zoom. Meet/Zoom require a validated provider-specific HTTPS meeting link. Daily remains supported for existing records but is no longer offered as a new selection.
- Teacher profile no longer offers a default external platform preference; classroom choice is per lesson and defaults to LingoRoom.
- Student dashboard lesson rows no longer disclose the selected provider; the student sees the generic classroom entry action.
- Student classroom side panel no longer exposes provider switching rules or provider-change history.
- Countdown is suppressed while a booking is pending teacher confirmation. Confirmed lesson windows continue to use the server's existing early-entry gate (teacher 30 minutes, student 10 minutes).
- Classroom details now show both scheduled start and end times in the signed-in user's timezone.

## Preserved
- Existing LingoRoom/Jitsi classroom, textbook workspace, shared whiteboard, audio, practice, chat, presence and recording-consent code.
- Admin-managed teaching material records and private material authorization.
- Existing Meet/Zoom URL validation and room token/access timing.
- No schema changes or production database writes.

## Validation
- TypeScript transpile/syntax checks passed for all modified TS/TSX files.
- `npm ci` did not complete within the available execution window; full typecheck, lint, build and integration tests remain unverified.
- No production deployment was performed.
