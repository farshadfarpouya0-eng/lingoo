export function validateHostedEnvironment(provider) {
  const problems = [];
  const warnings = [];
  const scopeHint = provider === "Netlify" ? "Set it in Netlify with Builds and Functions scopes." : "Set it in Vercel for the intended deployment environment, then redeploy.";
  const required = name => {
    const value = process.env[name];
    if (!value) problems.push(`${name} is missing. ${scopeHint}`);
    return value;
  };
  const databaseUrl = required("DATABASE_URL");
  if (databaseUrl) {
    try {
      const parsed = new URL(databaseUrl);
      if (!["postgres:", "postgresql:"].includes(parsed.protocol)) problems.push("DATABASE_URL must be a PostgreSQL connection string.");
      if (["localhost", "127.0.0.1", "::1", "[::1]"].includes(parsed.hostname)) problems.push(`${provider} cannot access the sandbox's local PostgreSQL. Use a hosted, pooled database URL.`);
      if (!parsed.searchParams.has("sslmode")) warnings.push("Use your database provider's TLS-enabled connection string.");
      if (parsed.hostname.endsWith(".neon.tech") && !parsed.hostname.split(".")[0].endsWith("-pooler")) {
        warnings.push("DATABASE_URL points to a direct Neon endpoint. Prefer the pooled endpoint for serverless app traffic; keep the direct endpoint for schema migrations and administration.");
      }
    } catch { problems.push("DATABASE_URL is not a valid URL."); }
  }
  const secret = required("SESSION_SECRET");
  if (secret && secret.length < 32) problems.push("SESSION_SECRET must contain at least 32 random characters.");
  const payoutKey = required("PAYOUT_ENCRYPTION_KEY");
  if (payoutKey && payoutKey.length < 32) problems.push("PAYOUT_ENCRYPTION_KEY must contain at least 32 random characters and remain stable for decrypting saved payout details.");
  const cronSecret = required("CRON_SECRET");
  if (cronSecret && cronSecret.length < 32) problems.push("CRON_SECRET must contain at least 32 random characters.");
  const reminderSecret = required("REMINDER_CRON_SECRET");
  if (reminderSecret && reminderSecret.length < 32) problems.push("REMINDER_CRON_SECRET must contain at least 32 random characters.");
  const origin = required("APP_URL");
  if (origin) {
    try {
      const parsed = new URL(origin);
      if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash) {
        problems.push("APP_URL must be the canonical HTTPS origin with no credentials, path or query string.");
      }
    } catch { problems.push("APP_URL must be a valid HTTPS origin."); }
  }
  if (Boolean(process.env.STRIPE_SECRET_KEY) !== Boolean(process.env.STRIPE_WEBHOOK_SECRET)) problems.push("Configure both Stripe secrets, or leave both unset. Partial payment configuration is unsafe.");
  if (process.env.JITSI_DOMAIN && !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/i.test(process.env.JITSI_DOMAIN)) problems.push("JITSI_DOMAIN must be a hostname, without a protocol or path.");
  if (Boolean(process.env.SUPABASE_URL) !== Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)) problems.push("Configure both SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, or leave both unset.");
  if (!process.env.SUPABASE_URL) warnings.push("Private material/document uploads will not work until private Supabase Storage is configured.");
  if (Boolean(process.env.RESEND_API_KEY) !== Boolean(process.env.RESEND_FROM)) problems.push("Configure both RESEND_API_KEY and RESEND_FROM, or leave both unset.");
  if (!process.env.RESEND_API_KEY) warnings.push("Automated lesson reminder emails are disabled until Resend is configured.");
  if (!process.env.REMINDER_CRON_SECRET) warnings.push("Lesson reminder delivery will not run until a scheduler calls /api/cron/lesson-reminders with REMINDER_CRON_SECRET.");
  if (provider !== "Vercel" && process.env.TRUST_PROXY_HEADERS !== "true") warnings.push("On non-Vercel hosting, IP-based throttling is disabled unless TRUST_PROXY_HEADERS=true is set behind a trusted ingress that strips client-supplied forwarding headers and writes authoritative values. Shared account-based throttling remains active.");
  warnings.push("Shared PostgreSQL rate-limit counters require migration 0013. Upstash Redis is optional and can be configured under Admin → Integrations.");
  warnings.push("Scheduled job history requires migration 0014; time-limited account sanctions require migration 0015. Run the external reminder and settlement schedules documented in DEPLOYMENT.md.");
  if (process.env.ENABLE_DEMO_DATA === "true") problems.push("ENABLE_DEMO_DATA=true is not allowed in hosted deployments because demo accounts use a known password. Demo fixtures are local-database-only.");
  if (process.env.ENABLE_ADMIN_IMPERSONATION === "true") warnings.push("ENABLE_ADMIN_IMPERSONATION=true lets any admin sign in as any user. Keep it off in production unless you are actively testing.");
  if (process.env.ENABLE_DEMO_PAYMENTS === "true") problems.push("ENABLE_DEMO_PAYMENTS=true is not allowed in hosted deployments. Simulated top-ups could mint wallet credit.");
  if (!process.env.JITSI_DOMAIN) warnings.push(`Lingo Room uses public Jitsi. ${provider} does not host the video service.`);
  for (const warning of warnings) console.warn(`[deployment warning] ${warning}`);
  if (problems.length) {
    for (const problem of problems) console.error(`[deployment error] ${problem}`);
    process.exitCode = 1;
    return false;
  }
  console.log(`${provider} deployment environment passed validation (no secret values printed). Apply the hosted DB schema separately before launch.`);
  return true;
}
