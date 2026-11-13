/** Public configuration policy shared by the classroom and token issuer. No credentials are returned. */
export type VideoProvider = "jaas" | "self-hosted" | "unconfigured";
export type VideoMode = "auto" | "jaas" | "self-hosted" | "disabled";
export type VideoSettings = {
  mode: string;
  jitsiDomain: string;
  jaasAppId: string;
  jaasApiKeyId: string;
  jaasPrivateKey: string;
  jitsiAppId: string;
  jitsiAppSecret: string;
};
export type VideoTicket = {
  domain: string;
  roomName: string;
  jwt: string;
  expiresAt: number;
  moderator: boolean;
  displayName: string;
};

export const VIDEO_SETUP_MESSAGE = "LingoRoom needs a production video provider. The administrator must connect 8x8 JaaS or a private JWT-protected Jitsi server in Admin → Integrations. The public meet.jit.si demo is not used for lessons.";
export const isPublicJitsiHost = (host: string) => host.toLowerCase() === "meet.jit.si" || /(^|\.)8x8\.vc$/i.test(host);
export function isVideoHostname(host: string) {
  return /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(host) && !host.includes("..");
}
export const isJaasAppId = (id: string) => /^vpaas-magic-cookie-[a-f0-9]{32}$/i.test(id);

export type VideoConfigIssue =
  | "ready" | "invalid_mode" | "mode_disabled"
  | "jaas_app_id_missing" | "jaas_app_id_invalid"
  | "jaas_key_id_missing" | "jaas_key_id_invalid" | "jaas_key_id_app_mismatch"
  | "jaas_private_key_missing" | "jaas_private_key_invalid"
  | "jitsi_domain_missing" | "jitsi_domain_invalid" | "jitsi_domain_public"
  | "jitsi_app_id_missing" | "jitsi_secret_missing" | "jitsi_secret_short"
  | "not_configured" | "credentials_unreadable";

const VIDEO_MODES = ["auto", "jaas", "self-hosted", "disabled"];
const privateKeyShapeValid = (key: string) => /^-----BEGIN (?:RSA )?PRIVATE KEY-----[\s\S]+-----END (?:RSA )?PRIVATE KEY-----$/.test(key.trim().replace(/\\n/g, "\n"));

function jaasIssue(video: VideoSettings): VideoConfigIssue {
  if (!video.jaasAppId) return "jaas_app_id_missing";
  if (!isJaasAppId(video.jaasAppId)) return "jaas_app_id_invalid";
  if (!video.jaasApiKeyId) return "jaas_key_id_missing";
  if (!/^(?:vpaas-magic-cookie-[a-f0-9]{32}\/)?[a-zA-Z0-9_-]+$/i.test(video.jaasApiKeyId)) return "jaas_key_id_invalid";
  if (video.jaasApiKeyId.includes("/") && !video.jaasApiKeyId.startsWith(`${video.jaasAppId}/`)) return "jaas_key_id_app_mismatch";
  if (!video.jaasPrivateKey) return "jaas_private_key_missing";
  if (!privateKeyShapeValid(video.jaasPrivateKey)) return "jaas_private_key_invalid";
  return "ready";
}
function selfHostedIssue(video: VideoSettings): VideoConfigIssue {
  if (!video.jitsiDomain) return "jitsi_domain_missing";
  if (!isVideoHostname(video.jitsiDomain)) return "jitsi_domain_invalid";
  if (isPublicJitsiHost(video.jitsiDomain)) return "jitsi_domain_public";
  if (!video.jitsiAppId) return "jitsi_app_id_missing";
  if (!video.jitsiAppSecret) return "jitsi_secret_missing";
  if (video.jitsiAppSecret.length < 32) return "jitsi_secret_short";
  return "ready";
}

/** Resolve the provider and, when it cannot be used, report the exact missing/invalid part. */
export function diagnoseVideoConfig(video: VideoSettings): { provider: VideoProvider; issue: VideoConfigIssue } {
  if (!VIDEO_MODES.includes(video.mode)) return { provider: "unconfigured", issue: "invalid_mode" };
  const mode = video.mode as VideoMode;
  if (mode === "disabled") return { provider: "unconfigured", issue: "mode_disabled" };
  if (mode === "jaas") {
    const issue = jaasIssue(video);
    return { provider: issue === "ready" ? "jaas" : "unconfigured", issue };
  }
  if (mode === "self-hosted") {
    const issue = selfHostedIssue(video);
    return { provider: issue === "ready" ? "self-hosted" : "unconfigured", issue };
  }
  const jaas = jaasIssue(video);
  if (jaas === "ready") return { provider: "jaas", issue: "ready" };
  const selfHosted = selfHostedIssue(video);
  if (selfHosted === "ready") return { provider: "self-hosted", issue: "ready" };
  // In auto mode, if the admin started entering JaaS credentials, report the
  // incomplete JaaS part instead of an unrelated self-hosted problem.
  const jaasStarted = !!(video.jaasAppId || video.jaasApiKeyId || video.jaasPrivateKey);
  return { provider: "unconfigured", issue: jaasStarted ? jaas : selfHosted === "jitsi_domain_missing" ? "not_configured" : selfHosted };
}

/** Never fall back to an anonymous public meeting when production credentials are missing. */
export function resolveVideoProvider(video: VideoSettings): VideoProvider {
  return diagnoseVideoConfig(video).provider;
}

export const VIDEO_ISSUE_MESSAGES: Record<VideoConfigIssue, string> = {
  ready: "Video provider is configured.",
  invalid_mode: "The saved video provider mode is invalid. Open Admin → Integrations → Video rooms, select 8x8 JaaS and save again.",
  mode_disabled: "The video provider is disabled. Select 8x8 JaaS in Admin → Integrations → Video rooms and save.",
  jaas_app_id_missing: "JaaS App ID is missing on the server. Save it in Admin → Integrations → Video rooms.",
  jaas_app_id_invalid: "JaaS App ID format is invalid. It must be the complete vpaas-magic-cookie-… value from the JaaS API keys page.",
  jaas_key_id_missing: "JaaS API key ID is missing on the server. Save it in Admin → Integrations → Video rooms.",
  jaas_key_id_invalid: "JaaS API key ID format is invalid. Copy the Key ID (kid), not the key name.",
  jaas_key_id_app_mismatch: "JaaS API key ID belongs to a different App ID. Copy App ID and Key ID from the same JaaS application.",
  jaas_private_key_missing: "JaaS private key is missing on the server. Paste the downloaded private key in Admin → Integrations → Video rooms.",
  jaas_private_key_invalid: "JaaS private key format is invalid. Paste the complete PEM text beginning with -----BEGIN PRIVATE KEY----- or -----BEGIN RSA PRIVATE KEY-----.",
  jitsi_domain_missing: "Private Jitsi hostname is missing.",
  jitsi_domain_invalid: "Private Jitsi hostname is invalid. Enter a hostname only, without https:// or a path.",
  jitsi_domain_public: "A public Jitsi host cannot be used as the private JWT deployment.",
  jitsi_app_id_missing: "Private Jitsi JWT application ID is missing.",
  jitsi_secret_missing: "Private Jitsi JWT secret is missing.",
  jitsi_secret_short: "Private Jitsi JWT secret must be at least 32 characters.",
  not_configured: "No production video provider is configured yet.",
  credentials_unreadable: "The saved integration credentials could not be read. An administrator should check the original encryption key and run classroom diagnostics. Do not replace or reset existing keys.",
};

export function videoJoinUrl(video: VideoSettings, provider: VideoProvider, room: string) {
  if (provider === "unconfigured") return "";
  const domain = provider === "jaas" ? "8x8.vc" : video.jitsiDomain;
  const tenant = provider === "jaas" ? `${video.jaasAppId}/` : "";
  // This is only a room identifier, never an access credential. JWTs are issued by POST video-token.
  return `https://${domain}/${tenant}${room}`;
}
