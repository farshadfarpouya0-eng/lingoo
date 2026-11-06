import test from "node:test";
import assert from "node:assert/strict";
import { createHmac, generateKeyPairSync, verify as verifySignature } from "node:crypto";
import { createJitsiTicket } from "../src/lib/jitsi-video";
import { resolveVideoProvider, videoJoinUrl, isVideoHostname, type VideoSettings } from "../src/lib/video-provider";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
const appId = `vpaas-magic-cookie-${"a1b2c3d4".repeat(4)}`;
const now = 1_800_000_000;
const room = "lingorain-abc123";
const jaas: VideoSettings = { mode: "jaas", jitsiDomain: "", jaasAppId: appId, jaasApiKeyId: "abc123", jaasPrivateKey: privateKey, jitsiAppId: "lingorain", jitsiAppSecret: "" };
const selfHosted: VideoSettings = { mode: "self-hosted", jitsiDomain: "meet.example.com", jaasAppId: "", jaasApiKeyId: "", jaasPrivateKey: "", jitsiAppId: "lingorain", jitsiAppSecret: "a-test-only-secret-with-more-than-32-characters" };
const issue = (video: VideoSettings, isTeacher: boolean, endsAt = new Date((now + 3600) * 1000)) => createJitsiTicket({ video, room, userId: isTeacher ? 10 : 20, displayName: isTeacher ? "Teacher" : "Student", isTeacher, lessonEndsAt: endsAt, now });
const decode = (jwt: string) => JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString("utf8")) as { aud: string; iss: string; sub: string; room: string; exp: number; nbf: number; moderator?: boolean; affiliation?: string; context: { user: { id: string; moderator: string | boolean; affiliation?: string }; features: Record<string, boolean> } };

test("missing, disabled or public-demo configuration fails closed", () => {
  const empty = { ...jaas, mode: "auto", jaasAppId: "", jaasApiKeyId: "", jaasPrivateKey: "" };
  assert.equal(resolveVideoProvider(empty), "unconfigured");
  assert.equal(resolveVideoProvider({ ...empty, jitsiDomain: "meet.jit.si" }), "unconfigured");
  assert.equal(resolveVideoProvider({ ...jaas, mode: "disabled" }), "unconfigured");
  assert.equal(resolveVideoProvider({ ...jaas, jaasPrivateKey: "" }), "unconfigured");
  assert.equal(videoJoinUrl(empty, "unconfigured", room), "");
  assert.throws(() => issue(empty, true), /production video provider/);
});
test("JaaS teacher JWT has a valid RS256 signature and exact documented claims", () => {
  const ticket = issue(jaas, true);
  const [headerPart, payload, signature] = ticket.jwt.split(".");
  const header = JSON.parse(Buffer.from(headerPart, "base64url").toString("utf8")) as { alg: string; kid: string };
  assert.equal(header.alg, "RS256");
  assert.equal(header.kid, `${appId}/abc123`);
  assert.equal(verifySignature("RSA-SHA256", Buffer.from(`${headerPart}.${payload}`), publicKey, Buffer.from(signature, "base64url")), true);
  const claims = decode(ticket.jwt);
  assert.equal(claims.aud, "jitsi"); assert.equal(claims.iss, "chat"); assert.equal(claims.sub, appId);
  assert.equal(claims.room, room); assert.notEqual(claims.room, "*");
  assert.equal(claims.context.user.moderator, "true");
  assert.equal(claims.context.features.recording, false);
  assert.equal(claims.exp - now, 900);
  assert.equal(ticket.domain, "8x8.vc"); assert.equal(ticket.roomName, `${appId}/${room}`);
  assert.equal(ticket.jwt.includes("PRIVATE KEY"), false);
  assert.equal(videoJoinUrl(jaas, "jaas", room).includes("#"), false);
  assert.equal(videoJoinUrl(jaas, "jaas", room).includes("jwt="), false);
});
test("JaaS students never receive moderator permission", () => {
  const ticket = issue(jaas, false);
  assert.equal(ticket.moderator, false);
  assert.equal(decode(ticket.jwt).context.user.moderator, "false");
  assert.equal(decode(ticket.jwt).context.user.id, "20");
});
test("a full key ID is accepted only for its own application", () => {
  assert.equal(issue({ ...jaas, jaasApiKeyId: `${appId}/key2` }, true).moderator, true);
  assert.throws(() => issue({ ...jaas, jaasApiKeyId: `vpaas-magic-cookie-${"b".repeat(32)}/key2` }, true), /production video provider|does not belong/);
});
test("invalid signing keys and room injection are rejected", async () => {
  assert.throws(() => issue({ ...jaas, jaasPrivateKey: "not-a-key" }, true), /production video provider/);
  const { validateJaasPrivateKey } = await import("../src/lib/video-keys");
  assert.throws(() => validateJaasPrivateKey("not-a-key"), /RSA private key/);
  assert.throws(() => createJitsiTicket({ video: jaas, room: "../other", userId: 1, displayName: "Teacher", isTeacher: true, lessonEndsAt: new Date((now + 3600) * 1000), now }), /room identifier/);
});
test("self-hosted JWT uses HMAC and boolean roles, never the string false", () => {
  for (const isTeacher of [true, false]) {
    const ticket = issue(selfHosted, isTeacher);
    const [h, p, s] = ticket.jwt.split(".");
    assert.equal((JSON.parse(Buffer.from(h, "base64url").toString("utf8")) as { alg: string }).alg, "HS256");
    const expected = createHmac("sha256", selfHosted.jitsiAppSecret).update(`${h}.${p}`).digest();
    assert.deepEqual(Buffer.from(s, "base64url"), expected);
    const claims = decode(ticket.jwt);
    assert.equal(claims.context.user.moderator, isTeacher);
    assert.equal(claims.moderator, isTeacher);
    assert.equal(claims.affiliation, isTeacher ? "owner" : "member");
    assert.equal(claims.context.user.affiliation, isTeacher ? "owner" : "member");
    assert.equal(claims.iss, "lingorain"); assert.equal(claims.sub, "meet.example.com");
    assert.equal(ticket.roomName, room);
  }
});
test("public hosts cannot be relabelled as a private JWT deployment", () => {
  for (const domain of ["meet.jit.si", "8x8.vc", "tenant.8x8.vc"]) {
    const video = { ...selfHosted, jitsiDomain: domain };
    assert.equal(resolveVideoProvider(video), "unconfigured");
    assert.throws(() => issue(video, true), /production video provider/);
  }
  assert.equal(isVideoHostname("https://meet.example.com/path"), false);
  assert.equal(isVideoHostname("meet.example.com"), true);
});
test("tokens expire and cannot outlive the lesson grace window", () => {
  assert.throws(() => issue(jaas, true, new Date((now - 1000) * 1000)), /ended/);
  const ticket = issue(jaas, true, new Date((now - 800) * 1000));
  assert.equal(ticket.expiresAt, (now + 100) * 1000);
});
