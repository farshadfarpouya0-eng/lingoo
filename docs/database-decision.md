# Database recommendation for Lingorain

## Decision

**Recommended for the current project: hosted PostgreSQL on Neon.** This is a practical fit for Lingorain, not a claim that Neon is the fastest or best provider for every workload.

- The application already uses PostgreSQL, Drizzle and node-postgres. Wallet transactions, package credits, reservations and row locks do not need a database rewrite.
- Neon can be connected directly to Netlify or provisioned through the Vercel Marketplace. The underlying database is still Neon in either case.
- A Free plan can support development and an initial low-traffic pilot within current quotas. A paid plan is optional, based on resource needs, backup requirements and the importance of avoiding database wake-up latency.

## Recommended configuration

1. Put the application functions and the database in the **same region**. For the currently documented setup, Singapore is the selected common region. Region placement is a recommendation until the external services have actually been provisioned.
2. Use Neon's **pooled** connection as `DATABASE_URL` for serverless traffic. Keep the direct connection private for schema migrations/admin tooling (`DATABASE_DIRECT_URL` or the integration's `DATABASE_URL_UNPOOLED`). The deployment preflight warns about a direct Neon runtime connection without printing credentials.
3. Use the provider's TLS connection string. Do not disable certificate validation.
4. For a pilot, start with Free and monitor quotas. For predictable first-query latency, consider Launch with scale-to-zero disabled where supported; always-active compute increases billed hours. Verify current plan terms before purchase.
5. Keep video media outside PostgreSQL and the website's app server. Neon stores classroom metadata and meeting links, not the live video stream.
6. Keep previews isolated from real wallet data and maintain tested backups before accepting customer money.

## Important limits

- Paying for Neon alone does not guarantee website speed or remove all application/serverless cold starts.
- Network reachability and latency from real China/Japan users must be measured. Same-region compute/DB reduces backend distance, not every cross-border networking issue.
- The runtime remains on the local sandbox database until an external connection is configured; these files do not create an account, buy a plan, transfer data or deploy to Vercel/Netlify.
- Shared rate limiting, scheduled settlement, real payments/payouts, monitoring and account recovery remain part of the commercial release checklist.

## Guides and references

- Vercel setup: `docs/vercel-deployment.md`
- Netlify setup: `docs/netlify-deployment.md`
- Performance/cost tradeoffs: `docs/performance-plan.md`
- Neon production checklist: https://neon.com/docs/get-started/production-checklist
- Drizzle on Neon: https://neon.com/docs/guides/drizzle
- Current pricing: https://neon.com/pricing
