"use client";

type AssetTicket = { signedUrl?: string; reference?: string; contentType?: string; error?: string };
export async function uploadMaterialAsset(file: File, materialKind: "textbook" | "audio" | "worksheet") {
  if (file.size < 1 || file.size > 25 * 1024 * 1024) throw new Error(`File "${file.name}" must be between 1 byte and 25 MB.`);
  const prep = await fetch("/api/private-files/upload/prepare", { method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store", body: JSON.stringify({ purpose: "material", materialKind, fileName: file.name, mimeType: file.type, size: file.size }) });
  const ticket = await prep.json() as AssetTicket;
  if (!prep.ok || !ticket.signedUrl || !ticket.reference || !ticket.contentType) throw new Error(ticket.error || "Could not prepare private upload. Check Admin → Integrations → Private storage.");
  const uploaded = await fetch(ticket.signedUrl, { method: "PUT", headers: { "Content-Type": ticket.contentType, "x-upsert": "false" }, body: file, cache: "no-store" });
  if (!uploaded.ok) throw new Error(`Storage rejected ${file.name}. Check private bucket CORS and file-size settings.`);
  return ticket.reference;
}
