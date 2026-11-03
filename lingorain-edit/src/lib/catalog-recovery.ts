export type CatalogResult<T> = { items: T[]; unavailable: boolean };

/** Marketing content should not disappear because the dynamic tutor list fails. */
export async function loadPublicCatalog<T>(load: () => Promise<T[]>): Promise<CatalogResult<T>> {
  try { return { items: await load(), unavailable: false }; }
  catch (error) {
    const detail = error as { code?: string; cause?: { code?: string } } | null;
    console.error("[Lingorain public catalog] Unavailable", { code: detail?.cause?.code || detail?.code || "CATALOG_UNAVAILABLE" });
    return { items: [], unavailable: true };
  }
}
export const CATALOG_NOTICES = {
  en: "Tutor profiles are temporarily unavailable. The rest of the site is still visible; please try again shortly.",
  zh: "老师资料暂时无法加载。网站其他内容仍可浏览，请稍后重试。",
  ja: "講師情報を一時的に読み込めません。他の内容は閲覧できます。しばらくしてから再度お試しください。",
};
