import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const PREFIX = "p1:";
export const isEncryptedPayoutAccount = (value: string) => value.startsWith(PREFIX);

function payoutKey() {
  const secret = process.env.PAYOUT_ENCRYPTION_KEY || "";
  if (secret.length < 32) {
    throw new Error("PAYOUT_ENCRYPTION_KEY must be set to a stable secret of at least 32 characters before payout details can be saved or revealed.");
  }
  return createHash("sha256").update(`lingorain:payout-details:v1:${secret}`).digest();
}

/** AES-256-GCM envelope; a fresh IV is generated for every saved account. */
export function encryptPayoutAccount(account: string) {
  const value = account.trim();
  if (value.length < 4 || value.length > 200) throw new Error("Invalid payout account.");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", payoutKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `${PREFIX}${iv.toString("base64url")}:${cipher.getAuthTag().toString("base64url")}:${encrypted.toString("base64url")}`;
}

/** Legacy plaintext is returned only for controlled server-side migration/reveal. */
export function decryptPayoutAccount(stored: string) {
  if (!stored.startsWith(PREFIX)) return stored;
  const [ivRaw, tagRaw, dataRaw] = stored.slice(PREFIX.length).split(":");
  if (!ivRaw || !tagRaw || !dataRaw) throw new Error("Stored payout account has an invalid encryption format.");
  const decipher = createDecipheriv("aes-256-gcm", payoutKey(), Buffer.from(ivRaw, "base64url"));
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(dataRaw, "base64url")), decipher.final()]).toString("utf8");
}

export function maskPayoutAccount(stored: string) {
  if (!stored) return "Not provided";
  try {
    const plain = decryptPayoutAccount(stored).replace(/\s+/g, "");
    return `•••• ${plain.slice(-4)}`;
  } catch {
    // Do not leak ciphertext or plaintext if the encryption key is unavailable.
    return "Stored securely · key unavailable";
  }
}
