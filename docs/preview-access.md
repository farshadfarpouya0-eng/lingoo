# Preview access is not permanent deployment

The builder preview is a disposable E2B sandbox. Its external hostname is not a registered, permanent Lingorain domain. An HTTP check from the sandbox does not prove that every user's network/browser can reach the preview.

## Fresh-runtime repair

The reported screenshot showed the application error boundary, not an unreachable domain. The missing-table failure was reproduced on a fresh local sandbox: the PostgreSQL instance was reachable but had no application tables, so `ensureSeed()` failed before the home page could render.

`src/instrumentation.ts` now prepares the disposable preview schema and sample records before the Node.js server accepts requests. `src/db/preview-bootstrap.ts` derives additive table/column/index definitions from the application's current Drizzle metadata, serialises setup with a database lock, and caches its readiness promise. It never drops tables or deletes existing data. Both an E2B sandbox flag and a local PostgreSQL hostname are required; external production databases still require explicit, reviewed migrations.

`ensureSeed()` also awaits schema readiness, and concurrent requests await the same seed operation. The health route verifies schema readiness rather than only a database ping. `scripts/test-preview-startup.ts` verifies fresh schema creation, repeated setup, preservation of balances and older-schema additions in a transaction-isolated test schema. `scripts/test-fresh-preview-server.ts` additionally starts a real production Next server against a brand-new temporary database twice, without a manual schema push; it verifies separate clients, old cookies and unchanged existing account balances. Only that test's own temporary database is removed afterwards.

The home page's dynamic tutor catalog is separately error-contained. A temporary tutor-data failure now shows a localized notice in that section rather than replacing the entire landing page with an error screen. It does not invent available tutors, balances or bookings. The general error boundary includes a reference ID and a full reload action, and request errors are logged with only routing/error identifiers.

## Embedded builder preview

A strict `frame-ancestors 'none'` CSP and `X-Frame-Options: DENY` prevent the builder from embedding the website. The configuration now relaxes only those two restrictions when BOTH conditions hold:

- the application is running in an E2B sandbox identified by its runtime environment; and
- the configured PostgreSQL hostname is local to that sandbox.

All other CSP, cookie and content security policies remain. Vercel/Netlify deployments with hosted PostgreSQL retain clickjacking protection. The relaxation is for a disposable demo, not a production hosting recommendation.

## Cross-device “No permission”

A permission page before the Lingorain homepage can come from the builder/preview access layer rather than the app's student/tutor permissions. A successful request from the sandbox does not reproduce the visitor's access conditions. Do not fix this by disabling classroom membership checks or exposing authenticated financial routes.

For an explicitly public demo, start the managed server, then run `node scripts/share-preview.mjs`. It creates a temporary Cloudflare hostname over the HTML-preserving loopback proxy, with no builder session required. It is restricted to managed E2B + local demo PostgreSQL, supervises its two child processes, and stops after four hours at most (or earlier if the sandbox stops). The URL is printed as `PUBLIC_PREVIEW_URL` and saved only to the sandbox's temporary directory. No permanent domain or external deployment is provisioned.

Validate the exact address with `scripts/check-preview.mjs` and `scripts/test-public-browser.mjs`; the latter uses an independent no-cookie browser profile and checks that no permission gate appears before real homepage content. An automated isolated browser is not a physical test of the user's other device or network. Only a real persistent deployment supplies a lasting public origin.

## Alternative temporary access

A Cloudflare Quick Tunnel can provide a separate `trycloudflare.com` hostname for the same managed preview server, without an account. This is only an alternative demonstration path. It has no uptime guarantee, changes hostname on restart, and stops when the tunnel process or sandbox stops. It is not a permanent domain, does not migrate the DB, and does not eliminate regional network restrictions.

Validate the exact public address with `node scripts/check-preview.mjs <origin>` and in a browser before sharing it. Verify content and assets, not merely status 200. Real video-provider calls are independent of preview accessibility.

Cloudflare's default email obfuscation can mutate server-rendered React HTML (for example, demo account addresses) and cause hydration errors. For the temporary tunnel only, `scripts/preview-access-proxy.mjs` can forward the managed server over loopback and append `Cache-Control: no-transform` to its existing response cache policy. Point the quick tunnel at the proxy's loopback port 3400, not directly at port 3000. The proxy does not alter data, cookies or the app's own no-store policy. Stop it when the temporary demonstration ends; it is not the production app server.

Reference for disabling proxy HTML transformation: https://developers.cloudflare.com/waf/tools/scrape-shield/email-address-obfuscation/

## Permanent site

A stable site requires an authorised deployment to the user's Vercel/Netlify project, an external persistent PostgreSQL database and the required runtime secrets. No hosting account token or external DB was configured in the sandbox when this troubleshooting was performed. Do not represent a preview or quick tunnel as a completed permanent deployment.

Reference: https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/
