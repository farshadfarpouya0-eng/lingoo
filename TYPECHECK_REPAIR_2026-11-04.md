# Lingorain consolidated TypeScript repair — 2026-11-04

This release is based on the latest consolidated Admin Materials + Crypto Wallet source package. It keeps the booking/time-zone, LingoRoom Studio, admin-managed teaching-material library, teacher demo room, and crypto wallet/payment work in one project tree.

## Fixes for the reported TypeScript errors

1. `src/app/dashboard/page.tsx`: restored the `teacherWeeklySlots` schema import used by the teacher timetable query.
2. `src/app/dashboard/page.tsx`: the teacher demo is passed its published `demoMaterials` collection (`<TeacherClassTest materials={demoMaterials} />`).
3. `src/components/LingoRoom.tsx`: imports the `IconName` type from `Icon.tsx` and uses the shared classroom material contract.
4. Added `src/lib/classroom-material.ts` as the single `ClassroomMaterial` type contract for the server-rendered class page, live-room component, LingoRoom, teaching workspace and teacher demo.
5. `ClassroomLive`, `LingoRoom`, `ClassroomTeachingWorkspace`, and `TeacherClassTest` now share the same material field shape (`id`, `title`, `kind`, `category`, `language`, `level`, `fileUrl`, `coverUrl`, `description`).
6. The classroom page queries all the fields required by the shared material type for tutors, and only the currently selected published material for students.

## Important project-folder instruction

The ZIP contains **one project root only** (`src/`, `package.json`, `tsconfig.json`, etc. at the archive root). Do not extract it into a parent directory that already contains a nested `lingorain-edit/` project folder. Either extract into a clean folder and open that folder in your editor, or overlay its root files onto the existing Git repository root. Do not keep a second copy such as `lingorain-edit/src/` inside the project; `tsconfig.json` intentionally includes all `**/*.ts` and `**/*.tsx` files, so duplicate nested source trees will also be type-checked.

## Release verification

- ZIP integrity verified.
- Changed TypeScript/TSX files parsed with the TypeScript compiler API with no syntax diagnostics.
- Type-level consistency is enforced through the shared `ClassroomMaterial` type.
- Full `npm run typecheck` and `npm run build` were not run in this container because npm dependencies are not installed here. Run both after `npm ci` on the deployment machine before pushing.
- No production database changes or migrations were run by this packaging step.
