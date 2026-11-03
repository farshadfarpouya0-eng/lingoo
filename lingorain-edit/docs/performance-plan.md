> **Current hosting direction (2026-10-30):** This document contains historical performance and Netlify-oriented planning. The current Lingorain deployment target is **Vercel + Neon**. Do not follow old Netlify region/build recommendations as current instructions. Use the root `DEPLOYMENT.md` and `docs/vercel-deployment.md` for the current setup. Region and plan choices must be checked against the actual Neon and Vercel projects; no fixed Singapore region is enforced in the current `vercel.json`.

# Lingorain performance plan

## Free versus paid Neon: cost is a choice, not an application requirement

Neon offers a **Free** plan at $0/month with no credit card required. At the time the official pricing/plans pages were checked, it includes **1 GB of PostgreSQL storage and 100 CU-hours of compute per project per month**, plus a **5 GB/month public network transfer allowance**. CU-hours measure database compute size multiplied by active hours, not website uptime or a fixed number of users.

Lingorain works with a hosted PostgreSQL connection on either Free or paid Neon; there is no paid-plan dependency in the application. Free can be used for development and an initial low-traffic pilot while monitoring quotas. If compute or network allowances are exhausted, database access may pause until reset or upgrade; stored data is not deleted by that quota pause.

On Free, compute automatically suspends after five idle minutes and this cannot be disabled. The next database connection may have extra wake-up latency; this does **not** mean every page request is slow. Launch/Scale are usage-based, with no fixed minimum monthly fee according to the current plans documentation. Launch allows scale-to-zero to be disabled. Always-active compute increases billed hours and does not eliminate unrelated application/network latency.

The paid setup below is a speed/predictability recommendation for commercial use, not a requirement to test or deploy Lingorain. Start with Free if keeping initial costs at zero is the priority, then upgrade the same project when measured usage or wake-up latency justifies it. Verify current pricing in the Neon console before purchase: https://neon.com/pricing and https://neon.com/docs/introduction/plans . Netlify and video hosting costs are separate.

## Recommended first commercial deployment

1. Netlify **Pro** with the Next.js/OpenNext adapter. Select **Singapore (`sin`)** in **Cloud compute → Functions Region** in the project UI, then redeploy.
2. A paid Neon PostgreSQL project created in **Singapore (`aws-ap-southeast-1`)**. Use the provider's pooled runtime connection; keep the direct connection for reviewed schema migrations.
3. For predictable DB latency, disable **Scale to zero** on the production compute where the paid plan permits it. This reduces database wake-up delays, not all possible serverless cold starts. Keep it enabled on preview/development branches if cost matters.
4. Keep video infrastructure separate. A dedicated Jitsi/media service near actual students handles video; Netlify serves the app. Meeting links and the Lingo UI do not provision a media server.
5. Measure from real Chinese and Japanese networks before commercial launch. Same-region compute and DB reduce backend round trips, but do not guarantee mainland-China routing or access to Google services.

As checked against the linked official docs, region selection requires Netlify Pro/Enterprise; new Netlify functions default to Ohio. Do not put a Singapore DB behind an Ohio function simply because the static CDN is global. For adapter-generated Next.js functions, use the project UI region setting, not an invented generic environment variable or TOML override.

If absolutely minimising compute cold starts becomes necessary, compare an always-on application service plus hosted PostgreSQL in the **same** region after real load measurements. That requires more infrastructure/ops than the managed Netlify setup; no provider choice alone guarantees speed.

## Changes implemented in the application

### Public images

- Six children’s illustrations resized to 520px-wide WebP for their card display size.
- Original combined size in this checkout: **10.77 MiB**; optimised combined size: about **0.10 MiB** (approximately **99% fewer bytes**). This is an asset-size reduction, not a claimed page-load improvement of 99%.
- Five marketing photographs are now self-hosted WebP, so visitors do not depend on a Pexels request for the landing page.
- Hero uses responsive 640px / 1200px versions; the smaller version is around 28 KiB.
- Offscreen marketing/kids images are lazy-loaded. Static assets can be served by Netlify’s CDN.
- User avatars still use their existing sources; real uploaded tutor photography should also be stored behind the site's own asset delivery path.

### Public data cache

- The home page’s featured tutors use Next’s explicit Data Cache for **60 seconds**.
- Profile, review, registration and moderation server actions invalidate the public tag.
- No cache contains authenticated sessions, wallet balances, purchased credits, available booking slots or meeting links.
- Booking and checkout still validate the current DB state transactionally. Image/caching optimisation never overrides financial or access control checks.

### Dashboard/database load

- A profile/package tab no longer downloads the learner’s entire lesson history.
- Overview reads only the next five active lessons; total lessons/minutes/earnings are calculated in PostgreSQL.
- Message contacts use a distinct ID query instead of reading lesson bodies/notes.
- Tutor data sent to the package client excludes biographies/scheduling fields it does not use.
- Dashboard-triggered settlement is scoped to the visiting user and only selects actually eligible rows (bounded to 100 per run), rather than scanning every active class globally.
- A protected scheduled settlement job is still recommended for guaranteed unattended processing.

### Classroom polling

- Active class: 4 seconds for prompt platform switching.
- Pending/early waiting room: 10 seconds (60% fewer regular poll attempts than a 4-second interval).
- Closed class: no periodic polling.
- Hidden tabs: no regular polling; tab visibility/focus triggers an immediate resync.
- At most one in-flight poll per page, with a timeout and capped backoff on failures.
- Unchanged snapshots reuse React state; no unnecessary video iframe reload.
- The room query only fetches the fields needed to build the participant-scoped snapshot.

## Alternative: Vercel with Marketplace Neon

If you prefer provisioning everything through Vercel, install the Neon Marketplace integration from Vercel's Storage dashboard. It injects `DATABASE_URL` (pooled) and `DATABASE_URL_UNPOOLED` (direct); the underlying database remains Neon, with its own plan/usage even when billing is handled in the Vercel dashboard. The old Vercel Postgres service is no longer offered for new projects.

`vercel.json` selects Singapore (`sin1`) for the application functions. Create the connected database in Singapore too. See `docs/vercel-deployment.md` for setup, schema tooling and plan terms. Vercel Hobby is for non-commercial personal use; choose an appropriate commercial hosting plan for a live paid tutoring business. A Marketplace integration reduces setup work, not physical network distance or all possible cold starts.

## Measurement checklist

Do not judge backend placement from a local preview:

- Run tests with actual data and expected concurrent bookings/classes.
- Separate first-request (cold) timings from warm request timings.
- Compare P50/P95 for DB round trips, homepage TTFB, dashboard navigation and transactional actions.
- In a real mobile browser, target good Core Web Vitals (LCP ≤ 2.5s, INP ≤ 200ms, CLS ≤ 0.1 at the 75th percentile); these are goals, not measured guarantees for this preview.
- Check function/DB quotas and class polling costs at realistic concurrency.
- Monitor errors, backups and the media service separately.

## References

- Netlify regions and plan availability: https://docs.netlify.com/build/functions/optional-configuration/
- Neon regions: https://neon.com/docs/introduction/regions
- Neon compute lifecycle and Scale to zero: https://neon.com/docs/introduction/compute-lifecycle
- Next Data Cache: https://nextjs.org/docs/app/api-reference/functions/unstable_cache
