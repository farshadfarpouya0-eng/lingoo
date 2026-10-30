# Lingorain – TypeScript fixes

This patch addresses the eight TypeScript diagnostics reported by `npm run typecheck` in six files.

1. `src/app/admin/audit/page.tsx`: changed the optional metadata conditional to explicit null/undefined checks so an `unknown` JSON value is not returned as a React child.
2. `src/app/api/lessons/[id]/presence/route.ts`: imported `isAccountSuspended` from the shared account-status helper.
3. `src/components/TeacherCard.tsx`: replaced unsupported SVG `title` prop on the custom `Icon` component with `aria-label`.
4. `src/lib/actions.ts`: imported `isAccountSuspended` and narrowed validated `nativeLang` to the `Lang` union before indexing `DEFAULT_TIME_ZONE`.
5. `src/lib/auth.ts`: asserted the non-null SQL predicate returned by `and(...)` before passing it to `not(...)` (all predicate operands are present).
6. `src/lib/classroom-actions.ts`: imported `isAccountSuspended` from the shared helper.

## Verification limitation

The source edits were applied and checked. A fresh `npm ci` could not complete in this environment because DNS/network access to `registry.npmjs.org` failed (`EAI_AGAIN`). Consequently, `tsc --noEmit` could not run against the project's installed dependency/type packages here. Run `npm ci` and `npm run typecheck` locally before pushing. Do not push if further diagnostics appear.
