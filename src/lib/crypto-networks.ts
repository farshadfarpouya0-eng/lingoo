export const CRYPTO_ASSETS = {
  usdt_trc20: { label: "USDT · TRC20", coin: "USDT", network: "TRON · TRC20", plisio: "USDT_TRX", now: "usdttrc20", directKey: "directUsdtTrc20", coingecko: "", tron: true },
  usdt_bep20: { label: "USDT · BEP20", coin: "USDT", network: "BNB Smart Chain · BEP20", plisio: "USDT_BSC", now: "usdtbsc", directKey: "directUsdtBep20", coingecko: "", tron: false },
  bnb_bep20: { label: "BNB · BEP20", coin: "BNB", network: "BNB Smart Chain · native BNB", plisio: "BNB", now: "bnbbsc", directKey: "directBnbBep20", coingecko: "binancecoin", tron: false },
  trx_tron: { label: "TRX · TRON", coin: "TRX", network: "TRON · native TRX", plisio: "TRX", now: "trx", directKey: "directTrxTron", coingecko: "tron", tron: true },
} as const;
export type CryptoAsset = keyof typeof CRYPTO_ASSETS;
export const isCryptoAsset = (value: string): value is CryptoAsset => Object.prototype.hasOwnProperty.call(CRYPTO_ASSETS, value);
export function validReceivingAddress(asset: CryptoAsset, address: string) {
  return CRYPTO_ASSETS[asset].tron ? /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(address) : /^0x[a-fA-F0-9]{40}$/.test(address);
}
/** Canonical hash form prevents the same transfer bypassing the DB uniqueness rule via case/0x variants. */
export function normalizeTxHash(asset: CryptoAsset, raw: string) {
  const compact = raw.trim().toLowerCase().replace(/^0x/, "");
  if (!/^[a-f0-9]{64}$/.test(compact)) return "";
  return CRYPTO_ASSETS[asset].tron ? compact : `0x${compact}`;
}
export function validCheckoutUrl(provider: "nowpayments" | "plisio", raw: unknown) {
  if (typeof raw !== "string" || !raw) return "";
  try {
    const url = new URL(raw);
    const host = provider === "nowpayments" ? "nowpayments.io" : "plisio.net";
    return url.protocol === "https:" && !url.username && !url.password && (url.hostname === host || url.hostname.endsWith(`.${host}`)) ? url.toString() : "";
  } catch { return ""; }
}
/** Exact decimal comparison without floating-point rounding of money. */
export function decimalUnits(value: string, decimals = 18): bigint | null {
  if (!/^\d{1,24}(?:\.\d{1,18})?$/.test(value.trim())) return null;
  const [whole, fraction = ""] = value.trim().split(".");
  try { return BigInt(whole) * BigInt(10) ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, "0") || "0"); } catch { return null; }
}
export function decimalAtLeast(actual: string, expected: string) {
  const a = decimalUnits(actual), b = decimalUnits(expected);
  return a !== null && b !== null && a >= b;
}
export function validExplorerUrl(asset: CryptoAsset, raw: string, txHash: string) {
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();
    const allowed = CRYPTO_ASSETS[asset].tron ? host === "tronscan.org" || host === "www.tronscan.org" : host === "bscscan.com" || host === "www.bscscan.com";
    const normalizedHash = txHash.replace(/^0x/i, "").toLowerCase();
    return allowed && url.protocol === "https:" && !url.username && !url.password && url.href.toLowerCase().includes(normalizedHash);
  } catch { return false; }
}
