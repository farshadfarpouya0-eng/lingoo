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

/** Never fall back to an anonymous public meeting when production credentials are missing. */
export function resolveVideoProvider(video: VideoSettings): VideoProvider {
  const mode: VideoMode = ["auto", "jaas", "self-hosted", "disabled"].includes(video.mode) ? video.mode as VideoMode : "disabled";
  if (mode === "disabled") return "unconfigured";
  const keyIdValid = /^(?:vpaas-magic-cookie-[a-f0-9]{32}\/)?[a-zA-Z0-9_-]+$/i.test(video.jaasApiKeyId) && (!video.jaasApiKeyId.includes("/") || video.jaasApiKeyId.startsWith(`${video.jaasAppId}/`));
  const keyShapeValid = /^-----BEGIN (?:RSA )?PRIVATE KEY-----[\s\S]+-----END (?:RSA )?PRIVATE KEY-----$/.test(video.jaasPrivateKey.trim().replace(/\\n/g, "\n"));
  const jaasReady = isJaasAppId(video.jaasAppId) && keyIdValid && keyShapeValid && (!video.jitsiDomain || video.jitsiDomain === "8x8.vc");
  const selfHostedReady = isVideoHostname(video.jitsiDomain) && !isPublicJitsiHost(video.jitsiDomain) && !!video.jitsiAppId && video.jitsiAppSecret.length >= 32;
  if (mode === "jaas") return jaasReady ? "jaas" : "unconfigured";
  if (mode === "self-hosted") return selfHostedReady ? "self-hosted" : "unconfigured";
  if (jaasReady) return "jaas";
  return selfHostedReady ? "self-hosted" : "unconfigured";
}

export function videoJoinUrl(video: VideoSettings, provider: VideoProvider, room: string) {
  if (provider === "unconfigured") return "";
  const domain = provider === "jaas" ? "8x8.vc" : video.jitsiDomain;
  const tenant = provider === "jaas" ? `${video.jaasAppId}/` : "";
  // This is only a room identifier, never an access credential. JWTs are issued by POST video-token.
  return `https://${domain}/${tenant}${room}`;
}
