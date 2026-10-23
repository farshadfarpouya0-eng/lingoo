import { ensureSeed } from "./seed";
import { getFeaturedTeachers } from "./public-tutors";
import { loadPublicCatalog } from "./catalog-recovery";

type Featured = Awaited<ReturnType<typeof getFeaturedTeachers>>;

const TTL_MS = 5 * 60_000;
let cached: { at: number; value: Featured } | null = null;

async function featured() {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.value;
  await ensureSeed();
  const value = await getFeaturedTeachers();
  cached = { at: Date.now(), value };
  return value;
}

export function getHomeCatalog() {
  return loadPublicCatalog(featured);
}