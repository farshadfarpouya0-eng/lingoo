import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { siteSettings } from "@/db/schema";
import { resolveVideoProvider, isJaasAppId, isVideoHostname, isPublicJitsiHost, VIDEO_SETUP_MESSAGE } from "./video-provider";
import { validateJaasPrivateKey } from "./video-keys";

/**
 * Integration credentials entered in the admin console are encrypted at rest.
 * Set INTEGRATION_ENCRYPTION_KEY to a long, stable secret in the deployment
 * environment. SESSION_SECRET is accepted only as a backwards-compatible fallback.
 * Rotating this key without first re-encrypting integration_config makes saved
 * provider secrets unreadable, so treat it as a backup-critical secret.
 */
const CONFIG_KEY = "integration_config";
const rootSecret = () => process.env.INTEGRATION_ENCRYPTION_KEY || process.env.SESSION_SECRET || "";
const encryptionKey = () => {
  const secret = rootSecret();
  if (secret.length < 32) throw new Error("Set INTEGRATION_ENCRYPTION_KEY to at least 32 characters before saving provider credentials.");
  return createHash("sha256").update(`lingorain:integration-settings:v1:${secret}`).digest();
};

type PersistedConfig = {
  version: 1;
  publicConfig: Record<string, string>;
  encryptedSecrets: Record<string, string>;
};
type Provider = "email" | "storage" | "payments" | "cryptoPayments" | "video" | "zoom" | "recording" | "realtime" | "rateLimit";

export const integrationEncryptionReady = () => rootSecret().length >= 32;
export function encryptIntegrationSecret(value: string) { return encryptSecret(value); }
export function decryptIntegrationSecret(value: string) { return decryptSecret(value); }

function encryptSecret(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `v1:${iv.toString("base64url")}:${cipher.getAuthTag().toString("base64url")}:${ciphertext.toString("base64url")}`;
}
function decryptSecret(value: string): string {
  const [version, ivRaw, tagRaw, cipherRaw] = value.split(":");
  if (version !== "v1" || !ivRaw || !tagRaw || !cipherRaw) throw new Error("Saved integration credential has an unsupported encryption format.");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivRaw, "base64url"));
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(cipherRaw, "base64url")), decipher.final()]).toString("utf8");
}

async function readPersisted(strict = false): Promise<PersistedConfig> {
  const query = db.select({ value: siteSettings.value }).from(siteSettings).where(eq(siteSettings.key, CONFIG_KEY)).limit(1);
  // Reads used while serving requests tolerate a missing table. Writes must not: if the read fails and
  // we carried on, the save below would silently replace every saved provider with an empty config.
  const [row] = strict ? await query : await query.catch(() => [] as { value: unknown }[]);
  const value = row?.value && typeof row.value === "object" ? row.value as Partial<PersistedConfig> : {};
  return {
    version: 1,
    publicConfig: value.publicConfig && typeof value.publicConfig === "object" ? value.publicConfig as Record<string, string> : {},
    encryptedSecrets: value.encryptedSecrets && typeof value.encryptedSecrets === "object" ? value.encryptedSecrets as Record<string, string> : {},
  };
}

export async function getIntegrationConfig() {
  const persisted = await readPersisted();
  const publicValue = (key: string, env: string, fallback = "") => persisted.publicConfig[key] || process.env[env] || fallback;
  const secretValue = (key: string, env: string) => {
    const encrypted = persisted.encryptedSecrets[key];
    if (encrypted) {
      try { return decryptSecret(encrypted); }
      catch (error) {
        // A valid environment value remains usable if an encrypted admin value
        // cannot be opened due to key rotation; surface this through admin tests.
        if (!process.env[env]) throw error;
      }
    }
    return process.env[env] || "";
  };
  return {
    email: {
      provider: "resend" as const,
      apiKey: secretValue("resendApiKey", "RESEND_API_KEY"),
      from: publicValue("resendFrom", "RESEND_FROM"),
    },
    storage: {
      provider: "supabase" as const,
      url: publicValue("supabaseUrl", "SUPABASE_URL").replace(/\/$/, ""),
      serviceRoleKey: secretValue("supabaseServiceRoleKey", "SUPABASE_SERVICE_ROLE_KEY"),
      bucket: publicValue("supabaseBucket", "SUPABASE_STORAGE_BUCKET", "lingorain-private"),
    },
    payments: {
      provider: "stripe" as const,
      secretKey: secretValue("stripeSecretKey", "STRIPE_SECRET_KEY"),
      webhookSecret: secretValue("stripeWebhookSecret", "STRIPE_WEBHOOK_SECRET"),
    },
    crypto: {
      nowPaymentsApiKey: secretValue("nowPaymentsApiKey", "NOWPAYMENTS_API_KEY"),
      nowPaymentsIpnSecret: secretValue("nowPaymentsIpnSecret", "NOWPAYMENTS_IPN_SECRET"),
      plisioSecretKey: secretValue("plisioSecretKey", "PLISIO_SECRET_KEY"),
      directUsdtTrc20: publicValue("cryptoDirectUsdtTrc20", "CRYPTO_DIRECT_USDT_TRC20"),
      directUsdtBep20: publicValue("cryptoDirectUsdtBep20", "CRYPTO_DIRECT_USDT_BEP20"),
      directBnbBep20: publicValue("cryptoDirectBnbBep20", "CRYPTO_DIRECT_BNB_BEP20"),
      directTrxTron: publicValue("cryptoDirectTrxTron", "CRYPTO_DIRECT_TRX_TRON"),
    },
    video: {
      mode: publicValue("videoProvider", "VIDEO_PROVIDER", "auto"),
      jitsiDomain: publicValue("jitsiDomain", "JITSI_DOMAIN").toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, ""),
      jaasAppId: publicValue("jaasAppId", "JAAS_APP_ID"),
      jaasApiKeyId: secretValue("jaasApiKeyId", "JAAS_API_KEY_ID"),
      jaasPrivateKey: secretValue("jaasPrivateKey", "JAAS_PRIVATE_KEY"),
      jitsiAppId: publicValue("jitsiAppId", "JITSI_APP_ID", "lingorain"),
      jitsiAppSecret: secretValue("jitsiAppSecret", "JITSI_APP_SECRET"),
    },
    zoom: {
      accountId: publicValue("zoomAccountId", "ZOOM_ACCOUNT_ID"),
      clientId: secretValue("zoomClientId", "ZOOM_CLIENT_ID"),
      clientSecret: secretValue("zoomClientSecret", "ZOOM_CLIENT_SECRET"),
    },
    realtime: {
      provider: (publicValue("realtimeProvider", "REALTIME_PROVIDER", "polling") === "pusher" ? "pusher" : "polling") as "pusher" | "polling",
      appId: secretValue("pusherAppId", "PUSHER_APP_ID"),
      key: secretValue("pusherAppKey", "PUSHER_APP_KEY"),
      secret: secretValue("pusherAppSecret", "PUSHER_APP_SECRET"),
      cluster: publicValue("pusherCluster", "PUSHER_CLUSTER"),
    },
    recording: {
      provider: (publicValue("recordingProvider", "RECORDING_PROVIDER", "disabled") === "daily" ? "daily" : "disabled") as "daily" | "disabled",
      dailyApiKey: secretValue("dailyApiKey", "DAILY_API_KEY"),
      dailyDomain: publicValue("dailyDomain", "DAILY_DOMAIN"),
      dailyWebhookPassword: secretValue("dailyWebhookPassword", "DAILY_WEBHOOK_PASSWORD"),
      dailyWebhookId: secretValue("dailyWebhookId", "DAILY_WEBHOOK_ID"),
    },
    rateLimit: {
      url: publicValue("upstashUrl", "UPSTASH_REDIS_REST_URL").replace(/\/$/, ""),
      token: secretValue("upstashToken", "UPSTASH_REDIS_REST_TOKEN"),
    },
    encryptionReady: rootSecret().length >= 32,
  };
}

export async function getIntegrationStatus() {
  const c = await getIntegrationConfig();
  return {
    encryptionReady: c.encryptionReady,
    email: { configured: !!(c.email.apiKey && c.email.from), from: c.email.from },
    storage: { configured: !!(c.storage.url && c.storage.serviceRoleKey && c.storage.bucket), bucket: c.storage.bucket },
    payments: { configured: !!(c.payments.secretKey && c.payments.webhookSecret) },
    crypto: {
      nowPaymentsConfigured: !!(c.crypto.nowPaymentsApiKey && c.crypto.nowPaymentsIpnSecret),
      plisioConfigured: !!c.crypto.plisioSecretKey,
      directConfigured: !!(c.crypto.directUsdtTrc20 || c.crypto.directUsdtBep20 || c.crypto.directBnbBep20 || c.crypto.directTrxTron),
      directUsdtTrc20: !!c.crypto.directUsdtTrc20,
      directUsdtBep20: !!c.crypto.directUsdtBep20,
      directBnbBep20: !!c.crypto.directBnbBep20,
      directTrxTron: !!c.crypto.directTrxTron,
    },
    video: {
      configured: resolveVideoProvider(c.video) !== "unconfigured",
      provider: resolveVideoProvider(c.video),
      mode: c.video.mode,
      domain: resolveVideoProvider(c.video) === "jaas" ? "8x8.vc" : c.video.jitsiDomain,
      jaasAppId: c.video.jaasAppId,
      jaasApiKeyIdSaved: !!c.video.jaasApiKeyId,
      jaasPrivateKeySaved: !!c.video.jaasPrivateKey,
      jitsiAppSecretSaved: !!c.video.jitsiAppSecret,
    },
    zoom: { configured: !!(c.zoom.accountId && c.zoom.clientId && c.zoom.clientSecret), accountId: c.zoom.accountId },
    realtime: { configured: c.realtime.provider === "pusher" && !!(c.realtime.appId && c.realtime.key && c.realtime.secret && c.realtime.cluster), provider: c.realtime.provider, cluster: c.realtime.cluster },
    recording: { configured: c.recording.provider === "daily" && !!c.recording.dailyApiKey && !!c.recording.dailyDomain, provider: c.recording.provider, domain: c.recording.dailyDomain },
    rateLimit: { configured: !!(c.rateLimit.url && c.rateLimit.token), provider: c.rateLimit.url && c.rateLimit.token ? "upstash" : "postgres" },
  };
}

export async function saveIntegrationProvider(provider: Provider, fd: FormData) {
  const persisted = await readPersisted(true);
  // Validate key before writing anything so a bad setup never silently loses credentials.
  const key = encryptionKey(); void key;
  const pub = { ...persisted.publicConfig };
  const sec = { ...persisted.encryptedSecrets };
  const val = (k: string, max = 500) => {
    const v = String(fd.get(k) ?? "").trim();
    if (v.length > max) throw new Error(`The value for ${k} is too long (maximum ${max} characters).`);
    return v;
  };
  const saveSecret = (field: string, storageKey: string, max = 500) => {
    if (fd.get(`clear_${field}`) === "on") { delete sec[storageKey]; return; }
    const raw = val(field, max);
    if (raw) sec[storageKey] = encryptSecret(raw);
  };
  switch (provider) {
    case "email": {
      const from = val("resendFrom", 254);
      const address = from.match(/^(?:[^<>]*<)?([^<>\s@]+@[^<>\s@]+\.[^<>\s@]+)>?$/)?.[1];
      if (from && (!address || /[\r\n]/.test(from) || (from.includes("<") !== from.includes(">")))) throw new Error("Enter a valid sender address, e.g. Lingorain <lessons@example.com>.");
      if (from) pub.resendFrom = from;
      saveSecret("resendApiKey", "resendApiKey", 500);
      break;
    }
    case "storage": {
      const url = val("supabaseUrl", 500);
      if (url) {
        let parsed: URL;
        try { parsed = new URL(url); } catch { throw new Error("Enter the full project URL including https://, like https://abcdefgh.supabase.co."); }
        if (parsed.protocol !== "https:" || !(parsed.hostname === "supabase.co" || parsed.hostname.endsWith(".supabase.co"))) throw new Error("Storage URL must be an HTTPS Supabase project URL, like https://abcdefgh.supabase.co.");
        pub.supabaseUrl = parsed.origin;
      }
      const bucket = val("supabaseBucket", 100);
      if (bucket) {
        if (!/^[a-z0-9][a-z0-9._-]{1,62}$/.test(bucket)) throw new Error("Bucket name may only use lowercase letters, numbers, dots, hyphens and underscores (2 to 63 characters).");
        pub.supabaseBucket = bucket;
      }
      saveSecret("supabaseServiceRoleKey", "supabaseServiceRoleKey", 1000);
      break;
    }
    case "payments":
      saveSecret("stripeSecretKey", "stripeSecretKey", 500);
      saveSecret("stripeWebhookSecret", "stripeWebhookSecret", 500);
      break;
    case "cryptoPayments": {
      saveSecret("nowPaymentsApiKey", "nowPaymentsApiKey", 1000);
      saveSecret("nowPaymentsIpnSecret", "nowPaymentsIpnSecret", 1000);
      saveSecret("plisioSecretKey", "plisioSecretKey", 1000);
      const address = (field: string, key: string, pattern: RegExp, hint: string) => {
        if (fd.get(`clear_${field}`) === "on") { delete pub[key]; return; }
        const value = val(field, 160);
        if (!value) return;
        if (!pattern.test(value)) throw new Error(`Enter a valid public ${hint} receiving address. Never enter a private key or recovery phrase.`);
        pub[key] = value;
      };
      address("cryptoDirectUsdtTrc20", "cryptoDirectUsdtTrc20", /^T[1-9A-HJ-NP-Za-km-z]{33}$/, "TRON/TRC20");
      address("cryptoDirectUsdtBep20", "cryptoDirectUsdtBep20", /^0x[a-fA-F0-9]{40}$/, "BNB Smart Chain/BEP20");
      address("cryptoDirectBnbBep20", "cryptoDirectBnbBep20", /^0x[a-fA-F0-9]{40}$/, "BNB Smart Chain/BNB");
      address("cryptoDirectTrxTron", "cryptoDirectTrxTron", /^T[1-9A-HJ-NP-Za-km-z]{33}$/, "TRON/TRX");
      break;
    }
    case "video": {
      const mode = val("videoProvider", 20) || "auto";
      if (!["auto", "jaas", "self-hosted", "disabled"].includes(mode)) throw new Error("Select a supported video provider.");
      const domain = val("jitsiDomain", 253).toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
      if (domain && !isVideoHostname(domain)) throw new Error("Enter a hostname only, such as meet.your-school.com, without a path or port.");
      if (domain && mode !== "jaas" && domain !== "8x8.vc" && isPublicJitsiHost(domain)) throw new Error("Public meet.jit.si has a five-minute embedding limit. Use 8x8 JaaS or your own JWT-protected Jitsi server.");
      if (mode === "jaas" && domain && domain !== "8x8.vc") throw new Error("JaaS meetings use 8x8.vc. Leave the hostname blank or enter 8x8.vc.");
      const appId = val("jaasAppId", 80);
      if (appId && !isJaasAppId(appId)) throw new Error("Copy the complete JaaS App ID beginning with vpaas-magic-cookie-.");
      const keyId = val("jaasApiKeyId", 200);
      if (keyId && !/^(?:vpaas-magic-cookie-[a-f0-9]{32}\/)?[a-zA-Z0-9_-]+$/i.test(keyId)) throw new Error("Enter the API key ID from the JaaS console, not an unrelated API secret.");
      const privateKey = val("jaasPrivateKey", 12_000);
      if (privateKey) validateJaasPrivateKey(privateKey);
      const jitsiAppId = val("jitsiAppId", 100);
      if (jitsiAppId && !/^[a-zA-Z0-9_-]+$/.test(jitsiAppId)) throw new Error("The JWT application ID may contain letters, numbers, hyphens and underscores only.");
      const appSecret = val("jitsiAppSecret", 500);
      if (appSecret && appSecret.length < 32) throw new Error("Use a random JWT application secret with at least 32 characters.");
      pub.videoProvider = mode;
      if (fd.get("clear_jitsiDomain") === "on") delete pub.jitsiDomain;
      else if (domain) pub.jitsiDomain = domain;
      else if (mode === "jaas") pub.jitsiDomain = "8x8.vc";
      if (fd.get("clear_jaasAppId") === "on") delete pub.jaasAppId;
      else if (appId) pub.jaasAppId = appId;
      if (jitsiAppId) pub.jitsiAppId = jitsiAppId;
      saveSecret("jaasApiKeyId", "jaasApiKeyId", 200);
      saveSecret("jaasPrivateKey", "jaasPrivateKey", 12_000);
      saveSecret("jitsiAppSecret", "jitsiAppSecret", 500);
      break;
    }
    case "zoom": {
      const accountId = val("zoomAccountId", 200);
      if (accountId) pub.zoomAccountId = accountId;
      if (fd.get("clear_zoomAccountId") === "on") delete pub.zoomAccountId;
      saveSecret("zoomClientId", "zoomClientId", 500);
      saveSecret("zoomClientSecret", "zoomClientSecret", 1000);
      break;
    }
    case "realtime": {
      const selected = val("realtimeProvider", 20);
      if (!new Set(["polling", "pusher"]).has(selected)) throw new Error("Invalid realtime provider.");
      pub.realtimeProvider = selected;
      const cluster = val("pusherCluster", 30).toLowerCase();
      if (cluster && !/^[a-z0-9-]{2,30}$/.test(cluster)) throw new Error("Enter the Pusher cluster code shown in your Pusher Channels dashboard, for example eu or us2.");
      if (cluster) pub.pusherCluster = cluster;
      saveSecret("pusherAppId", "pusherAppId", 100);
      saveSecret("pusherAppKey", "pusherAppKey", 200);
      saveSecret("pusherAppSecret", "pusherAppSecret", 500);
      break;
    }
    case "rateLimit": {
      const url = val("upstashUrl", 500).replace(/\/$/, "");
      if (url) {
        const parsed = new URL(url);
        if (parsed.protocol !== "https:" || !parsed.hostname.endsWith(".upstash.io") || parsed.username || parsed.password || parsed.search || parsed.hash) throw new Error("Enter the HTTPS REST URL shown in your Upstash Redis database.");
        pub.upstashUrl = parsed.origin;
      }
      saveSecret("upstashToken", "upstashToken", 2000);
      break;
    }
    case "recording": {
      const selected = val("recordingProvider", 20);
      if (!new Set(["disabled", "daily"]).has(selected)) throw new Error("Invalid recording provider.");
      pub.recordingProvider = selected;
      const domain = val("dailyDomain", 253).toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
      if (domain && !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+daily\.co$/i.test(domain)) {
        throw new Error("Enter a Daily subdomain ending in .daily.co, such as example.daily.co; custom domains are not allowed by the current Content Security Policy.");
      }
      if (domain) pub.dailyDomain = domain;
      saveSecret("dailyApiKey", "dailyApiKey", 1000);
      saveSecret("dailyWebhookPassword", "dailyWebhookPassword", 200);
      break;
    }
  }
  await db.insert(siteSettings).values({ key: CONFIG_KEY, value: { version: 1, publicConfig: pub, encryptedSecrets: sec }, updatedAt: new Date() })
    .onConflictDoUpdate({ target: siteSettings.key, set: { value: { version: 1, publicConfig: pub, encryptedSecrets: sec }, updatedAt: new Date() } });
}

export async function testIntegrationProvider(provider: Provider) {
  const c = await getIntegrationConfig();
  if (provider === "zoom") {
    const { getZoomAccessToken, zoomConfigured } = await import("./zoom-api");
    if (!zoomConfigured(c.zoom)) throw new Error("Enter Zoom Account ID, Client ID and Client Secret first.");
    await getZoomAccessToken(c.zoom);
    return true;
  }
  let url = "", headers: Record<string, string> = {};
  switch (provider) {
    case "email":
      if (!c.email.apiKey) throw new Error("Enter a Resend API key first.");
      url = "https://api.resend.com/domains"; headers = { Authorization: `Bearer ${c.email.apiKey}` }; break;
    case "storage":
      if (!c.storage.url || !c.storage.serviceRoleKey) throw new Error("Enter the Supabase URL and service-role key first.");
      url = `${c.storage.url}/storage/v1/bucket/${encodeURIComponent(c.storage.bucket)}`;
      headers = { Authorization: `Bearer ${c.storage.serviceRoleKey}`, apikey: c.storage.serviceRoleKey }; break;
    case "payments":
      if (!c.payments.secretKey) throw new Error("Enter a Stripe secret key first.");
      url = "https://api.stripe.com/v1/account"; headers = { Authorization: `Bearer ${c.payments.secretKey}` }; break;
    case "cryptoPayments": {
      const hasDirect = !!(c.crypto.directUsdtTrc20 || c.crypto.directUsdtBep20 || c.crypto.directBnbBep20 || c.crypto.directTrxTron);
      const checks: string[] = [];
      if (c.crypto.nowPaymentsApiKey || c.crypto.nowPaymentsIpnSecret) {
        if (!c.crypto.nowPaymentsApiKey || !c.crypto.nowPaymentsIpnSecret) throw new Error("NOWPayments requires both the API key and the IPN secret.");
        const response = await fetch("https://api.nowpayments.io/v1/currencies", { headers: { "x-api-key": c.crypto.nowPaymentsApiKey }, cache: "no-store", signal: AbortSignal.timeout(12_000) });
        if (!response.ok) throw new Error(`NOWPayments connection check failed (HTTP ${response.status}). Check the API key.`);
        checks.push("NOWPayments API connected");
      }
      if (c.crypto.plisioSecretKey) {
        const response = await fetch(`https://api.plisio.net/api/v1/shops?api_key=${encodeURIComponent(c.crypto.plisioSecretKey)}`, { cache: "no-store", signal: AbortSignal.timeout(12_000) });
        const result = await response.json().catch(() => ({})) as { status?: string };
        if (!response.ok || result.status !== "success") throw new Error(`Plisio connection check failed (HTTP ${response.status}). Check the Shop Secret and API permissions.`);
        checks.push("Plisio API connected");
      }
      if (!checks.length && !hasDirect) throw new Error("Configure at least one crypto payment provider or direct wallet address first.");
      return true;
    }
    case "video": {
      const provider = resolveVideoProvider(c.video);
      if (provider === "unconfigured") throw new Error(VIDEO_SETUP_MESSAGE);
      const { createJitsiTicket } = await import("./jitsi-video");
      // Validates the signing key and key ID without exposing either to the browser.
      createJitsiTicket({ video: c.video, room: "lingorain-connection-check", userId: 1, displayName: "Configuration check", isTeacher: true, lessonEndsAt: new Date(Date.now() + 60 * 60_000) });
      const domain = provider === "jaas" ? "8x8.vc" : c.video.jitsiDomain;
      const tenant = provider === "jaas" ? `${c.video.jaasAppId}/` : "";
      url = `https://${domain}/${tenant}external_api.js`;
      break;
    }
    case "realtime":
      if (c.realtime.provider !== "pusher" || !c.realtime.appId || !c.realtime.key || !c.realtime.secret || !c.realtime.cluster) throw new Error("Select Pusher and enter app ID, app key, app secret and cluster first.");
      {
        const { createHmac } = await import("node:crypto");
        const timestamp = Math.floor(Date.now() / 1000).toString();
        const query = new URLSearchParams([ ["auth_key", c.realtime.key], ["auth_timestamp", timestamp], ["auth_version", "1.0"] ]).toString();
        const path = `/apps/${encodeURIComponent(c.realtime.appId)}`;
        const signature = createHmac("sha256", c.realtime.secret).update(`GET\n${path}\n${query}`).digest("hex");
        url = `https://api-${c.realtime.cluster}.pusher.com${path}?${query}&auth_signature=${signature}`;
      }
      break;
    case "recording":
      if (c.recording.provider !== "daily" || !c.recording.dailyApiKey || !c.recording.dailyDomain) throw new Error("Select Daily and enter its API key and domain.");
      url = "https://api.daily.co/v1/rooms?limit=1"; headers = { Authorization: `Bearer ${c.recording.dailyApiKey}` }; break;
    case "rateLimit":
      if (!c.rateLimit.url || !c.rateLimit.token) throw new Error("Enter the Upstash Redis REST URL and token first.");
      url = `${c.rateLimit.url}/ping`; headers = { Authorization: `Bearer ${c.rateLimit.token}` }; break;
  }
  const response = await fetch(url, { method: provider === "video" ? "GET" : "GET", headers, cache: "no-store", signal: AbortSignal.timeout(12_000) });
  if (!response.ok) throw new Error(`${provider} connection check failed (HTTP ${response.status}). Check credentials and provider permissions.`);
  if (provider === "video") {
    const script = await response.text();
    if (!script.includes("JitsiMeetExternalAPI")) throw new Error("The hostname responded, but it is not serving the Jitsi external API. Check the video hostname and reverse proxy.");
    // This checks configuration/signing and API reachability, not provider billing or a live media join.
  }
  if (provider === "rateLimit") {
    const result = await response.json().catch(() => ({})) as { result?: unknown };
    if (String(result.result || "").toUpperCase() !== "PONG") throw new Error("Upstash replied, but the Redis PING response was not PONG.");
  }
  if (provider === "storage") {
    const bucket = await response.json() as { public?: boolean; file_size_limit?: number | null };
    if (bucket.public === true) throw new Error("Bucket is public. Protected Lingorain files require a private bucket.");
    if (typeof bucket.file_size_limit !== "number" || bucket.file_size_limit < 1 || bucket.file_size_limit > 25 * 1024 * 1024) throw new Error("Bucket file-size limit must be set to 25 MiB or less.");
  }
  return true;
}


/** Registers or updates the Daily recording webhooks. Secrets remain encrypted in site settings. */
export async function registerDailyWebhooks() {
  const cfg = await getIntegrationConfig();
  if (cfg.recording.provider !== "daily" || !cfg.recording.dailyApiKey || !cfg.recording.dailyWebhookPassword) {
    throw new Error("Enable Daily and enter its API key plus a webhook password first.");
  }
  const appUrl = (process.env.APP_URL || "").replace(/\/$/, "");
  let parsed: URL;
  try { parsed = new URL(appUrl); } catch { throw new Error("Set APP_URL to your public HTTPS application URL first."); }
  if (parsed.protocol !== "https:") throw new Error("APP_URL must use HTTPS to register the Daily webhook.");
  const persisted = await readPersisted(true);
  const webhookUrl = `${appUrl}/api/webhooks/daily`;
  const auth = `lingorain:${cfg.recording.dailyWebhookPassword}`;
  const payload = { url: webhookUrl, basicAuth: auth, eventTypes: ["recording.started", "recording.ready-to-download", "recording.error"] };
  const existingId = cfg.recording.dailyWebhookId;
  const response = await fetch(existingId ? `https://api.daily.co/v1/webhooks/${encodeURIComponent(existingId)}` : "https://api.daily.co/v1/webhooks", {
    method: existingId ? "POST" : "POST", headers: { Authorization: `Bearer ${cfg.recording.dailyApiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload), cache: "no-store", signal: AbortSignal.timeout(12_000),
  });
  const data = await response.json().catch(() => ({})) as { id?: string; uuid?: string; info?: string };
  if (!response.ok) throw new Error(`Daily webhook registration failed (HTTP ${response.status}). Check API permissions and webhook URL.`);
  const id = data.id || data.uuid || existingId;
  if (!id) throw new Error("Daily created the webhook but returned no webhook identifier.");
  const sec = { ...persisted.encryptedSecrets, dailyWebhookId: encryptSecret(id) };
  await db.insert(siteSettings).values({ key: CONFIG_KEY, value: { version: 1, publicConfig: persisted.publicConfig, encryptedSecrets: sec }, updatedAt: new Date() })
    .onConflictDoUpdate({ target: siteSettings.key, set: { value: { version: 1, publicConfig: persisted.publicConfig, encryptedSecrets: sec }, updatedAt: new Date() } });
  return id;
}
