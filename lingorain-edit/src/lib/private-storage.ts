import { randomUUID } from "node:crypto";
import { getIntegrationConfig } from "@/lib/integration-config";

const MAX_FILE_BYTES = 25 * 1024 * 1024;
type StorageConfig = Awaited<ReturnType<typeof getIntegrationConfig>>["storage"];

type FileKind = "material" | "document" | "avatar";

function extFor(mime: string): string | null {
  const m = mime.toLowerCase().split(";")[0].trim();
  const map: Record<string, string> = {
    "application/pdf": "pdf", "application/epub+zip": "epub", "text/plain": "txt",
    "audio/mpeg": "mp3", "audio/mp3": "mp3", "audio/wav": "wav", "audio/x-wav": "wav",
    "audio/ogg": "ogg", "audio/mp4": "m4a", "audio/aac": "aac",
    "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
  };
  return map[m] || null;
}
function hasValidSignature(buf: Buffer, mime: string) {
  const m = mime.toLowerCase().split(";")[0].trim();
  if (m === "application/pdf") return buf.subarray(0, 5).toString("ascii") === "%PDF-";
  if (m === "image/jpeg") return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  if (m === "image/png") return buf.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (m === "image/webp") return buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP";
  if (m === "audio/mpeg" || m === "audio/mp3") return buf.subarray(0, 3).toString("ascii") === "ID3" || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0);
  if (m === "audio/wav" || m === "audio/x-wav") return buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WAVE";
  if (m === "audio/ogg") return buf.subarray(0, 4).toString("ascii") === "OggS";
  if (m === "audio/mp4") return buf.subarray(4, 8).toString("ascii") === "ftyp";
  if (m === "audio/aac") return buf[0] === 0xff && (buf[1] & 0xf6) === 0xf0;
  if (m === "application/epub+zip") return buf.subarray(0, 2).toString("hex") === "504b";
  if (m === "text/plain") return !buf.subarray(0, Math.min(buf.length, 8192)).includes(0);
  return false;
}

async function assertPrivateBucket(storage?: StorageConfig) {
  const cfg = storage || (await getIntegrationConfig()).storage;
  const base = cfg.url, key = cfg.serviceRoleKey, bucket = cfg.bucket;
  if (!base || !key) throw new Error("Private storage is not configured. Add Supabase credentials in Admin → Integrations.");
  const r = await fetch(`${base}/storage/v1/bucket/${encodeURIComponent(bucket)}`, {
    headers: { Authorization: `Bearer ${key}`, apikey: key }, cache: "no-store", signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new Error(`Private storage bucket '${bucket}' is missing or inaccessible. Create it as a private bucket.`);
  const info = await r.json() as { public?: boolean; file_size_limit?: number | null };
  if (info.public === true) throw new Error("Refusing to store protected files in a public storage bucket.");
  // Signed upload tickets do not enforce the client-declared `size`. The Storage bucket
  // itself must cap uploads, otherwise an authenticated user could upload an oversized
  // object before the post-upload validation rejects its database record.
  if (typeof info.file_size_limit !== "number" || info.file_size_limit < 1 || info.file_size_limit > MAX_FILE_BYTES) {
    throw new Error("Configure the private Supabase bucket with a file-size limit of 25 MiB or less before enabling uploads.");
  }
}


const EXT_TO_MIME: Record<string, string> = {
  pdf: "application/pdf", epub: "application/epub+zip", txt: "text/plain",
  mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", m4a: "audio/mp4", aac: "audio/aac",
  jpg: "image/jpeg", png: "image/png", webp: "image/webp",
};

/** Create a short-lived, single-object upload URL so large files never pass through a serverless function body. */
export async function createSignedPrivateUpload(args: {
  folder: "materials" | "teacher-documents" | "avatars";
  ownerId: number;
  kind: FileKind;
  fileName: string;
  mimeType: string;
  size: number;
  materialKind?: string;
}) {
  const { folder, ownerId, kind, fileName, mimeType, size, materialKind } = args;
  if (!Number.isSafeInteger(ownerId) || ownerId < 1) throw new Error("Invalid upload owner.");
  if (!fileName || fileName.length > 255 || /[\u0000-\u001f\u007f]/.test(fileName)) throw new Error("Invalid file name.");
  if (!Number.isSafeInteger(size) || size < 1 || size > MAX_FILE_BYTES) throw new Error("File must be between 1 byte and 25 MB.");
  if (kind === "avatar" && size > 5 * 1024 * 1024) throw new Error("Profile pictures must be no larger than 5 MB.");
  const mime = mimeType.toLowerCase().split(";")[0].trim();
  const extension = extFor(mime);
  if (!extension) throw new Error("Unsupported file type.");
  if (kind === "document" && !["pdf", "jpg", "png", "webp"].includes(extension)) throw new Error("Teacher documents must be PDF, JPEG, PNG, or WebP.");
  if (kind === "avatar" && !["jpg", "png", "webp"].includes(extension)) throw new Error("Profile pictures must be JPEG, PNG, or WebP.");
  if (kind === "material") {
    const audio = ["mp3", "wav", "ogg", "m4a", "aac"].includes(extension);
    if (materialKind === "audio" && !audio) throw new Error("Choose an audio file for an audio resource.");
    if (materialKind !== "audio" && audio) throw new Error("Choose Audio as the material type for an audio file.");
  }
  const storage = (await getIntegrationConfig()).storage;
  await assertPrivateBucket(storage);
  const bucket = storage.bucket;
  const key = `${folder}/${ownerId}/${randomUUID()}.${extension}`;
  const objectPath = key.split("/").map(encodeURIComponent).join("/");
  const base = storage.url, serviceKey = storage.serviceRoleKey;
  const response = await fetch(`${base}/storage/v1/object/upload/sign/${encodeURIComponent(bucket)}/${objectPath}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey, "Content-Type": "application/json" },
    body: JSON.stringify({ upsert: false }),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error("Could not prepare private upload. Check the storage bucket configuration.");
  const payload = await response.json() as { url?: string; token?: string };
  if (!payload.url || !payload.token) throw new Error("Storage returned an invalid upload ticket.");

  // Supabase Storage JS builds the URL by concatenating its `/storage/v1` base
  // with the API's relative `data.url`. Resolving a leading-slash URL directly
  // against the project origin drops `/storage/v1` and produces a broken URL.
  const storageBase = new URL(`${base}/storage/v1`);
  let signedUrl: URL;
  if (/^https?:\/\//i.test(payload.url)) {
    signedUrl = new URL(payload.url);
  } else {
    const storagePath = storageBase.pathname.replace(/\/$/, "");
    const returnedPath = payload.url.startsWith(storagePath + "/")
      ? payload.url
      : `${storagePath}/${payload.url.replace(/^\/+/, "")}`;
    signedUrl = new URL(returnedPath, storageBase.origin);
  }
  const expectedPrefix = `${storageBase.pathname.replace(/\/$/, "")}/object/upload/sign/`;
  if (signedUrl.origin !== storageBase.origin || !signedUrl.pathname.startsWith(expectedPrefix)) {
    throw new Error("Storage returned an unsafe upload URL.");
  }
  // The Storage REST response may return the signed path and token separately.
  // Always include the token in the single-object upload URL.
  signedUrl.searchParams.set("token", payload.token);
  return {
    signedUrl: signedUrl.toString(),
    reference: `storage://${bucket}/${key}`,
    contentType: mime,
  };
}

async function readBounded(response: Response, maxBytes: number): Promise<Buffer> {
  const advertised = Number(response.headers.get("content-length") || 0);
  if (advertised > maxBytes) {
    await response.body?.cancel().catch(() => {});
    throw new Error("Uploaded file exceeds the 25 MB limit.");
  }
  if (!response.body) throw new Error("The uploaded file is empty.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new Error("Uploaded file exceeds the 25 MB limit.");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks.map(chunk => Buffer.from(chunk)), total);
}

/** Validate the final object, not just the client-supplied filename/MIME metadata. */
export async function validateUploadedPrivateFile(reference: string, folder: "materials" | "teacher-documents" | "avatars", ownerId: number, kind: FileKind) {
  const parsed = parsePrivateStorageRef(reference);
  if (!parsed || !parsed.key.startsWith(`${folder}/${ownerId}/`)) throw new Error("Invalid or unauthorized private upload reference.");
  const extension = parsed.key.split(".").pop()?.toLowerCase() || "";
  const mime = EXT_TO_MIME[extension];
  if (!mime) throw new Error("Unsupported uploaded file extension.");
  if (kind === "document" && !["pdf", "jpg", "png", "webp"].includes(extension)) throw new Error("Teacher documents must be PDF, JPEG, PNG, or WebP.");
  if (kind === "avatar" && !["jpg", "png", "webp"].includes(extension)) throw new Error("Profile pictures must be JPEG, PNG, or WebP.");
  // Only inspect the first 8 KiB. Downloading the entire audio/PDF back from
  // storage during a Server Action made large uploads slow and could exceed the
  // serverless function's execution window. Supabase Storage supports Range.
  const response = await fetchPrivateFile(reference, "bytes=0-8191");
  if (response.status !== 206 && response.status !== 200) {
    await response.body?.cancel().catch(() => {});
    throw new Error("Could not verify the uploaded file. Please retry the upload.");
  }
  const contentRange = response.headers.get("content-range");
  const totalFromRange = contentRange?.match(/\/(\d+)$/)?.[1];
  const advertisedSize = totalFromRange ? Number(totalFromRange) : Number(response.headers.get("content-length") || 0);
  if (advertisedSize > MAX_FILE_BYTES) {
    await response.body?.cancel().catch(() => {});
    throw new Error("Uploaded file exceeds the 25 MB limit.");
  }
  // A 200 response may mean the storage service ignored Range. Refuse to read a
  // large object in full just to validate its signature.
  if (response.status === 200 && advertisedSize > 8192) {
    await response.body?.cancel().catch(() => {});
    throw new Error("Storage did not support partial file verification. Check the Supabase Storage configuration and retry.");
  }
  const bytes = await readBounded(response, 8192);
  const actualSize = advertisedSize || bytes.length;
  if (kind === "avatar" && actualSize > 5 * 1024 * 1024) throw new Error("Profile pictures must be no larger than 5 MB.");
  if (!bytes.length || !hasValidSignature(bytes, mime)) throw new Error("Uploaded file content does not match its expected file type.");
  return { mime, extension, size: actualSize };
}

export async function uploadPrivateFile(file: File, folder: "materials" | "teacher-documents" | "avatars", ownerId: number, kind: FileKind) {
  if (!(file instanceof File) || file.size < 1 || file.size > MAX_FILE_BYTES) throw new Error("File must be between 1 byte and 25 MB.");
  const mime = file.type.toLowerCase().split(";")[0].trim();
  const extension = extFor(mime);
  if (!extension) throw new Error("Unsupported file type. Use PDF/EPUB/text, supported audio, or JPEG/PNG/WebP.");
  if (kind === "document" && !["pdf", "jpg", "png", "webp"].includes(extension)) throw new Error("Identity and credential documents must be PDF, JPEG, PNG, or WebP.");
  if (kind === "avatar" && (file.size > 5 * 1024 * 1024 || !["jpg", "png", "webp"].includes(extension))) throw new Error("Profile pictures must be JPEG, PNG, or WebP and no larger than 5 MB.");
  const bytes = Buffer.from(await file.arrayBuffer());
  if (!hasValidSignature(bytes, mime)) throw new Error("The uploaded file content does not match its declared file type.");
  const storage = (await getIntegrationConfig()).storage;
  await assertPrivateBucket(storage);
  const bucket = storage.bucket;
  const key = `${folder}/${ownerId}/${randomUUID()}.${extension}`;
  const path = key.split("/").map(encodeURIComponent).join("/");
  const base = storage.url, serviceKey = storage.serviceRoleKey;
  const response = await fetch(`${base}/storage/v1/object/${encodeURIComponent(bucket)}/${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey, "Content-Type": mime, "x-upsert": "false" },
    body: bytes as unknown as BodyInit,
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error("Private file upload failed. Check storage permissions and bucket settings.");
  return `storage://${bucket}/${key}`;
}

export function parsePrivateStorageRef(reference: string) {
  if (!reference.startsWith("storage://")) return null;
  const rest = reference.slice("storage://".length);
  const slash = rest.indexOf("/");
  if (slash < 1 || slash === rest.length - 1) return null;
  const bucket = rest.slice(0, slash);
  const key = rest.slice(slash + 1);
  if (!/^[a-z0-9][a-z0-9._-]{1,62}$/.test(bucket) || key.split("/").some(part => !part || part === "." || part === ".." || part.includes("\\") || /[\u0000-\u001f]/.test(part))) return null;
  return { bucket, key };
}

export async function fetchPrivateFile(reference: string, range?: string | null) {
  const parsed = parsePrivateStorageRef(reference);
  if (!parsed) throw new Error("This file is not stored in the private Lingorain bucket. Please re-upload it securely.");
  const storage = (await getIntegrationConfig()).storage;
  if (parsed.bucket !== storage.bucket) throw new Error("This file references a bucket that is not configured for Lingorain.");
  await assertPrivateBucket(storage);
  const base = storage.url, key = storage.serviceRoleKey;
  const path = parsed.key.split("/").map(encodeURIComponent).join("/");
  const response = await fetch(`${base}/storage/v1/object/authenticated/${encodeURIComponent(parsed.bucket)}/${path}`, {
    headers: { Authorization: `Bearer ${key}`, apikey: key, ...(range ? { Range: range } : {}) },
    cache: "no-store", signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error("Private file could not be retrieved.");
  return response;
}
export const privateFileExtension = (reference: string) => parsePrivateStorageRef(reference)?.key.split(".").pop()?.toLowerCase() || "bin";

export const privateFileContentType = (reference: string) => {
  const path = parsePrivateStorageRef(reference)?.key || "";
  const ext = path.split(".").pop()?.toLowerCase();
  const types: Record<string, string> = {
    pdf: "application/pdf", epub: "application/epub+zip", txt: "text/plain; charset=utf-8",
    mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", m4a: "audio/mp4", aac: "audio/aac",
    jpg: "image/jpeg", png: "image/png", webp: "image/webp",
  };
  return types[ext || ""] || "application/octet-stream";
};
