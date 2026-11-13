import { isJaasAppId, isVideoHostname, isPublicJitsiHost } from "./video-provider";

/** Use the same tenant-scoped SDK endpoint in the live classroom and admin tests. */
export function videoApiUrl(domain: string, roomName: string) {
  if (domain === "8x8.vc") {
    const appId = roomName.split("/")[0];
    if (!isJaasAppId(appId) || !roomName.includes("/")) throw new Error("Invalid JaaS application room.");
    return `https://8x8.vc/${appId}/external_api.js`;
  }
  if (!isVideoHostname(domain) || isPublicJitsiHost(domain)) throw new Error("Invalid private video hostname.");
  return `https://${domain}/external_api.js`;
}
