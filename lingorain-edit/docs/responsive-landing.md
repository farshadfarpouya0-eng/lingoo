# Lingorain split-audience landing and mobile layout

## First screen

- The shared hero introduces two clearly separate paths: adult English and kids English.
- Desktop/tablet: equal side-by-side cards, real adult photography and the existing Birdie/Teddy/Lulu art for children.
- Phone: compact vertically stacked cards. Both primary links fit the first 844px-tall screen at 390/430px widths in all three supported languages. On smaller devices the kids path starts near the top, before any long marketing section.
- Primary links use real server-side tutor filters: `audience=adults` and `audience=kids&tag=Kids`.
- The extended children’s section appears after the small discovery form rather than below several long detail rows.

## Mobile-specific design

- A separate dialog menu replaces the compressed desktop link/language row. It includes audience links, language switching and authentication links. Native focus handling, Escape, closing and body-scroll restoration are supported.
- Typography, card padding and section spacing use explicit phone/tablet layouts; desktop title/photo sizes are not simply scaled down.
- Children, tutor and learner-story cards use intentional horizontal snap rails with working next/previous buttons instead of tiny multi-column cards. Desktop presents grids.
- The comparison section uses per-item, two-option cards on phones, avoiding a squashed three-column table.
- Tutor cards show accent, rating, biography summary and price on separate readable rows.
- Professional line icons replace emoji; illustrated characters appear only in the kids content.
- Animation respects reduced-motion preferences, offscreen images are lazy-loaded and keyboard focus is visible.

## Assets and data

- `scripts/prepare-landing-hero.mjs` derives the two hero assets from the existing local images. It does not create new mascot designs or fetch remote media.
- Adult hero image includes 400/800px variants. Kids hero combines the existing saturated mascot art on transparency. All are compact WebP assets.
- Tutor filters query PostgreSQL through Drizzle. For this initial catalog, Kids topics identify children's tutors; the adult view excludes Kids-specialist profiles. This is a catalog filter, not verification of student age or a permanent tutor accreditation rule.
- Existing booking, package, wallet and classroom access rules are unchanged.

## Browser tests

`node scripts/test-responsive-home.mjs <origin>` covers 320, 360, 390, 430, 768, 1024 and 1440px widths in English/Chinese/Japanese, hero placement, page overflow, menu interactions, carousel buttons, audience-filtered teacher results and mobile language switching.

`node scripts/test-public-browser.mjs <public-origin>` validates real homepage rendering, login and session navigation in independent browser profiles. Browser screenshots go to `artifacts/`, which is excluded from Git and is not a public route.

These are responsive/browser tests, not a guarantee of global network reachability or a completed permanent hosting deployment.
