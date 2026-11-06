import { createHmac, sign as signBytes } from "node:crypto";
import { validateJaasPrivateKey } from "./video-keys";
import { resolveVideoProvider, isJaasAppId, isVideoHostname, isPublicJitsiHost, VIDEO_SETUP_MESSAGE, type VideoSettings, type VideoTicket } from "./video-provider";

/** Official JaaS RS256 claims: https://developer.8x8.com/jaas/docs/api-keys-jwt/ */
export function createJitsiTicket(input: {
  video: VideoSettings;
  room: string;
  userId: number;
  displayName: string;
  isTeacher: boolean;
  lessonEndsAt: Date;
  now?: number;
}): VideoTicket {
  const provider = resolveVideoProvider(input.video);
  if (provider === "unconfigured") throw new Error(VIDEO_SETUP_MESSAGE);
  if (!/^[a-zA-Z0-9_-]{1,180}$/.test(input.room)) throw new Error("Invalid video room identifier.");
  if (!Number.isSafeInteger(input.userId) || input.userId < 1) throw new Error("Invalid participant.");
  const now = input.now ?? Math.floor(Date.now() / 1000);
  const exp = Math.min(now + 15 * 60, Math.floor(input.lessonEndsAt.getTime() / 1000) + 15 * 60);
  if (exp <= now) throw new Error("This lesson has ended.");
  const name = input.displayName.trim().slice(0, 100) || (input.isTeacher ? "Tutor" : "Student");
  let domain: string;
  let roomName: string;
  let secret: string;
  const header: { alg: string; typ: string; kid?: string } = { alg: provider === "jaas" ? "RS256" : "HS256", typ: "JWT" };
  const claims = {
    aud: "jitsi",
    iss: provider === "jaas" ? "chat" : input.video.jitsiAppId,
    sub: provider === "jaas" ? input.video.jaasAppId : input.video.jitsiDomain,
    room: input.room,
    nbf: now - 30,
    exp,
    // Self-hosted token_affiliation / token_moderation plugins require booleans,
    // not the string "false" (which is truthy in Lua). JaaS uses its documented string claim.
    ...(provider === "self-hosted" ? { moderator: input.isTeacher, affiliation: input.isTeacher ? "owner" : "member" } : {}),
    context: {
      room: { regex: false },
      user: {
        id: String(input.userId), name,
        ...(provider === "jaas"
          ? { moderator: input.isTeacher ? "true" : "false", "hidden-from-recorder": false }
          : { moderator: input.isTeacher, affiliation: input.isTeacher ? "owner" : "member" }),
      },
      features: { recording: false, livestreaming: false, transcription: false, "outbound-call": false, "sip-outbound-call": false, "sip-inbound-call": false, "file-upload": false },
    },
  };
  if (provider === "jaas") {
    if (!isJaasAppId(input.video.jaasAppId)) throw new Error("Invalid JaaS App ID.");
    const keyId = input.video.jaasApiKeyId.includes("/") ? input.video.jaasApiKeyId : `${input.video.jaasAppId}/${input.video.jaasApiKeyId}`;
    if (!/^vpaas-magic-cookie-[a-f0-9]{32}\/[a-zA-Z0-9_-]+$/i.test(keyId) || !keyId.startsWith(`${input.video.jaasAppId}/`)) throw new Error("The JaaS API key ID does not belong to this App ID.");
    header.kid = keyId;
    domain = "8x8.vc";
    roomName = `${input.video.jaasAppId}/${input.room}`;
    secret = input.video.jaasPrivateKey;
  } else {
    if (!isVideoHostname(input.video.jitsiDomain) || isPublicJitsiHost(input.video.jitsiDomain) || input.video.jitsiAppSecret.length < 32) throw new Error(VIDEO_SETUP_MESSAGE);
    domain = input.video.jitsiDomain;
    roomName = input.room;
    secret = input.video.jitsiAppSecret;
  }
  const unsigned = `${Buffer.from(JSON.stringify(header)).toString("base64url")}.${Buffer.from(JSON.stringify(claims)).toString("base64url")}`;
  const signature = provider === "jaas"
    ? signBytes("RSA-SHA256", Buffer.from(unsigned), validateJaasPrivateKey(secret))
    : createHmac("sha256", secret).update(unsigned).digest();
  return { domain, roomName, jwt: `${unsigned}.${signature.toString("base64url")}`, expiresAt: exp * 1000, moderator: input.isTeacher, displayName: name };
}
