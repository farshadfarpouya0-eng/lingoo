import { createHash, createHmac } from "node:crypto";
import { getIntegrationConfig } from "@/lib/integration-config";

export async function getPusherPublicConfig() {
  const c = (await getIntegrationConfig()).realtime;
  if (c.provider !== "pusher" || !c.appId || !c.key || !c.secret || !c.cluster) return null;
  return { key: c.key, cluster: c.cluster };
}

export async function signPusherPrivateChannel(socketId: string, channelName: string) {
  const c = (await getIntegrationConfig()).realtime;
  if (c.provider !== "pusher" || !c.key || !c.secret) throw new Error("Realtime provider is not configured.");
  if (!/^\d+\.\d+$/.test(socketId) || !/^private-lesson-\d+$/.test(channelName)) throw new Error("Invalid realtime channel request.");
  const signature = createHmac("sha256", c.secret).update(`${socketId}:${channelName}`).digest("hex");
  return `${c.key}:${signature}`;
}

function rfc3986(value: string) {
  return encodeURIComponent(value).replace(/[!'()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

/** Publishes after the database insert. Pusher failure never discards the durable chat message. */
export async function publishPusherEvent(channel: string, eventName: string, payload: unknown) {
  const c = (await getIntegrationConfig()).realtime;
  if (c.provider !== "pusher" || !c.appId || !c.key || !c.secret || !c.cluster) return false;
  if (!/^private-lesson-\d+$/.test(channel) || !/^[a-z0-9-]{1,80}$/i.test(eventName)) throw new Error("Invalid realtime publish target.");
  const body = JSON.stringify({ name: eventName, channels: [channel], data: JSON.stringify(payload) });
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const params: Record<string, string> = {
    body_md5: createHash("md5").update(body).digest("hex"),
    auth_key: c.key,
    auth_timestamp: timestamp,
    auth_version: "1.0",
  };
  const query = Object.keys(params).sort().map(k => `${rfc3986(k)}=${rfc3986(params[k])}`).join("&");
  const path = `/apps/${encodeURIComponent(c.appId)}/events`;
  const signature = createHmac("sha256", c.secret).update(`POST\n${path}\n${query}`).digest("hex");
  const response = await fetch(`https://api-${c.cluster}.pusher.com${path}?${query}&auth_signature=${signature}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body, cache: "no-store", signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error(`Pusher publish failed (HTTP ${response.status}).`);
  return true;
}
