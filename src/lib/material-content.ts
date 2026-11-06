export type MaterialUnit = { title: string; content: string; audioRef: string; imageRef: string };
export type DecodedMaterial = { pdfRef: string; pageCount: number | null; units: MaterialUnit[]; pdfIssue: string };
type MaterialLike = { title: string; description?: string | null; fileUrl: string; kind?: string };
const AUDIO_EXT = /\.(mp3|wav|ogg|m4a|aac)$/i;
const privateRef = (value: unknown) => typeof value === "string" && value.startsWith("storage://") && value.includes("/materials/") ? value : "";
const text = (value: unknown) => typeof value === "string" ? value : "";

/** Single decoder for the admin preview, live classroom and protected asset endpoints. */
export function decodeMaterial(material: MaterialLike): DecodedMaterial {
  const raw = (material.fileUrl || "").trim();
  const empty: DecodedMaterial = { pdfRef: "", pageCount: null, units: [{ title: material.title, content: material.description || "", audioRef: "", imageRef: "" }], pdfIssue: "" };
  let parsed: Record<string, unknown> | null = null;
  try {
    const value: unknown = JSON.parse(raw);
    if (value && typeof value === "object" && !Array.isArray(value)) parsed = value as Record<string, unknown>;
  } catch { /* legacy single-file resource */ }
  if (!parsed) {
    if (privateRef(raw) && raw.toLowerCase().endsWith(".pdf")) return { ...empty, pdfRef: raw };
    if (privateRef(raw) && AUDIO_EXT.test(raw)) return { ...empty, units: [{ ...empty.units[0], audioRef: raw }] };
    if (raw && material.kind !== "audio") empty.pdfIssue = "This resource has no private PDF reference. An administrator must re-upload the PDF in Admin → Materials.";
    return empty;
  }
  const rawUnits = Array.isArray(parsed.units) ? parsed.units : [];
  const units = rawUnits.flatMap((entry): MaterialUnit[] => {
    if (!entry || typeof entry !== "object") return [];
    const item = entry as Record<string, unknown>;
    return [{ title: text(item.title).trim() || "Lesson", content: text(item.content), audioRef: privateRef(item.audioRef) || privateRef(item.audioUrl), imageRef: privateRef(item.imageRef) || privateRef(item.imageUrl) }];
  });
  if (!units.length) {
    const audioRef = privateRef(parsed.audioRef) || privateRef(parsed.audioUrl);
    units.push({ ...empty.units[0], audioRef });
  }
  const pdfRef = privateRef(parsed.pdfRef) || privateRef(parsed.pdfUrl);
  const count = Number(parsed.pageCount);
  const hadPdf = !!(parsed.pdfRef || parsed.pdfUrl);
  return {
    pdfRef,
    pageCount: Number.isSafeInteger(count) && count > 0 ? count : null,
    units,
    pdfIssue: !pdfRef && hadPdf ? "The saved PDF link is not a private Lingorain file. Re-upload it in Admin → Materials." : "",
  };
}

export function materialAssetReference(material: MaterialLike, asset: string, unitIndex = 0) {
  const decoded = decodeMaterial(material);
  if (asset === "pdf") return decoded.pdfRef;
  if (asset === "audio") return decoded.units[unitIndex]?.audioRef || "";
  if (asset === "image") return decoded.units[unitIndex]?.imageRef || "";
  return "";
}
