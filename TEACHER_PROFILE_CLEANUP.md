# Teacher profile cleanup

- Removed country-code flags and public identity/credential badge clutter from teacher cards and public teacher profile headers.
- Removed the accent label from public teacher cards and profiles.
- Removed country and accent controls from the teacher self-service profile form while preserving their existing values through hidden form fields, so saving a profile does not blank legacy data.
- Kept teacher name, photo, headline, bio, rating/reviews, lesson count, spoken languages, teaching topics, price, schedule, booking, and contact functionality intact.

Validation: TypeScript TSX transpile syntax checks passed for `TeacherCard.tsx`, `teachers/[id]/page.tsx`, and `ProfileForm.tsx`. Full typecheck/build and browser verification were not run because project dependencies are not installed in this workspace.
