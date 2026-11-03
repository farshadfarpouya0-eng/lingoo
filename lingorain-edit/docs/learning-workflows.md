# Lingorain: packages and classroom switching

## Package rules

- All amounts are integer USD cents and computed on the server from the tutor's current 50-minute price.
- 50 minutes: one lesson at regular price; 5 / 10 / 20 lessons at 5% / 10% / 15% off.
- 25 minutes: half of the 50-minute base price; 10 / 20 / 40 lessons at 5% / 10% / 15% off.
- Round the discounted per-lesson amount to cents, then multiply by the number of lessons. Show both the unit price and the total before checkout.
- Purchased prices are frozen. Credits are bound to the purchaser, tutor and duration, with no expiry.
- Checkout debits the wallet once. A unique purchase key makes retries idempotent. A stale quoted total is rejected.
- A package booking consumes one credit, not another wallet payment. Tutor income is paid from the frozen lesson price after completion, less the existing 15% fee.
- Timely cancellations and tutor cancellations return the credit to the package, not cash to the wallet. Confirmed student cancellations within 12 hours use the credit and pay the tutor once.
- Wallet top-ups remain explicitly marked as simulated when no payment provider is configured.

## Classroom rules

- Every new reservation starts with `platform=undecided` and an empty meeting URL.
- The profile preference is private; it only preselects the tutor's editing form. It does not set the booked lesson's platform.
- Only the owning tutor can choose or switch Lingo Room, Google Meet or Zoom. Changes remain available during a live lesson; completed/cancelled rooms cannot be changed.
- Meet and Zoom use a real meeting link supplied by the tutor. HTTPS, the correct host and a meeting path are validated. Links are not created through OAuth/API in this implementation.
- The room status API verifies participant membership and returns `Cache-Control: private, no-store`. External links are withheld from students before the join window.
- Visible room pages poll every four seconds and immediately resync on focus. Switching updates the join action/embedded room without reloading the student's page.
- A student can report a connection issue and ask for another platform. The tutor sees the request; saving a new platform clears it. Switching does not alter lesson credits, duration, price or wallet balance.
- Lingo Room is the Lingorain interface backed by Jitsi. `JITSI_DOMAIN` must be a hostname, e.g. `classroom.example.com`, for a self-hosted deployment. Public Jitsi remains the unconfigured fallback and has its own access/hosting limits.

## Setup and compatibility

1. Bootstrap the platform runtime, then apply the versioned SQL files with `ALLOW_PRODUCTION_MIGRATIONS=true npm run db:migrate` from a controlled release environment after a backup/staging run; do not use `drizzle-kit push` in production.
2. For old auto-selected, future Lingo bookings, run `npm exec --yes --package=tsx -- tsx scripts/prepare-classrooms.ts`. This is idempotent and does not reset tables or purchases.
3. Existing tutor preferences and explicit new choices are preserved.

## Tests

- Database/financial integration: `npm exec --yes --package=tsx -- tsx scripts/test-learning.ts`.
- Install Chromium once with `npx playwright install --with-deps chromium`.
- Real browser flow against the managed preview: `npm exec --yes --package=tsx -- tsx scripts/test-learning-ui.ts`. Optionally set `TEST_URL` to the HTTPS preview origin.
- Tests create temporary users/transactions and remove their own data afterwards. They never wipe production tables.
- Browser tests cover duration tabs, price rows, checkout, inventory, credit booking, tutor-only selection, live failover, issue reports, private API access and mobile overflow. Actual audio/video on external providers requires real meetings and is not exercised by these tests.
- Rate limiting uses shared PostgreSQL atomic counters by default (migration `0013`); Upstash Redis is an optional shared-store alternative. Production fails closed if neither shared mechanism is available.
