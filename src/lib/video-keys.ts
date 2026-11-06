import { createPrivateKey } from "node:crypto";

export function normalizePrivateKey(raw: string) {
  return raw.trim().replace(/\\n/g, "\n").replace(/\r\n/g, "\n");
}
export function validateJaasPrivateKey(raw: string) {
  try {
    const key = createPrivateKey(normalizePrivateKey(raw));
    if (key.asymmetricKeyType !== "rsa" || (key.asymmetricKeyDetails?.modulusLength ?? 0) < 2048) throw new Error("Unsupported key.");
    return key;
  } catch {
    throw new Error("Enter the matching JaaS RSA private key in PEM format (2048 bits or stronger), including its BEGIN and END lines.");
  }
}
