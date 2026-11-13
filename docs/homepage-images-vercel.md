# Homepage images on Vercel

The homepage uses bundled assets in `src/assets/home`, exposed by `src/lib/home-assets.ts`. Next.js emits them as `/_next/static/media/...` files during `next build`.

Some homepage content and older deployments still reference stable `/images/*.webp` paths. `next.config.ts` now copies the emitted WebP assets to `public/images` after the build completes. This avoids a deployment where Git contains only the source code but not the generated image files.

Run `npm run build` after any change to `next.config.ts` or homepage assets. A successful build should produce both the hashed media files and stable public paths such as `/images/hero-adults.webp` and `/images/hero-kids.webp`.

Deploy `next.config.ts`, `src/assets/home/`, `src/lib/home-assets.ts`, `src/lib/home-i18n.ts`, `src/lib/site-content.ts`, `src/components/LandingHero.tsx`, and `src/app/page.tsx`. If the live site still shows the old `/images` URLs or cached errors, trigger a new deployment without the previous build cache and reload with Ctrl+F5.

No production database migration is required for this image-loading change.
