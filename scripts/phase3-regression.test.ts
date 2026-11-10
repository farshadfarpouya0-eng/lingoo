import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import { decodeMaterial, materialAssetReference } from "../src/lib/material-content";
import { decimalAtLeast, normalizeTxHash, validCheckoutUrl, validExplorerUrl, validReceivingAddress } from "../src/lib/crypto-networks";
import { parseNowPaymentsStatus, parsePlisioOperation } from "../src/lib/crypto-provider-sync";

const pdfRef = "storage://lingorain-private/materials/1/book.pdf";
const audioRef = "storage://lingorain-private/materials/1/track.mp3";
test("structured and legacy PDF resources resolve to the same protected asset", () => {
  const structured = decodeMaterial({ title: "Book", fileUrl: JSON.stringify({ pdfRef, pageCount: 12, units: [{ title: "Unit 1", content: "Hello", audioRef }] }) });
  assert.equal(structured.pdfRef, pdfRef); assert.equal(structured.pageCount, 12); assert.equal(structured.units[0].audioRef, audioRef);
  const legacy = decodeMaterial({ title: "Old book", kind: "textbook", fileUrl: pdfRef });
  assert.equal(legacy.pdfRef, pdfRef);
  assert.equal(materialAssetReference({ title: "Old book", fileUrl: pdfRef }, "pdf"), pdfRef);
});
test("legacy audio and audioUrl fields remain playable", () => {
  assert.equal(decodeMaterial({ title: "Audio", kind: "audio", fileUrl: audioRef }).units[0].audioRef, audioRef);
  const old = decodeMaterial({ title: "Course", fileUrl: JSON.stringify({ units: [{ title: "Lesson", content: "", audioUrl: audioRef }] }) });
  assert.equal(old.units[0].audioRef, audioRef);
  assert.equal(materialAssetReference({ title: "Audio", fileUrl: audioRef }, "audio", 0), audioRef);
});
test("missing or unsafe PDF links give an actionable state, not a false attachment", () => {
  assert.equal(decodeMaterial({ title: "Text only", fileUrl: JSON.stringify({ units: [{ title: "Lesson", content: "Read this" }] }) }).pdfRef, "");
  const unsafe = decodeMaterial({ title: "Old link", fileUrl: JSON.stringify({ pdfRef: "https://example.com/book.pdf" }) });
  assert.equal(unsafe.pdfRef, ""); assert.match(unsafe.pdfIssue, /Re-upload/);
});
test("crypto amounts use exact decimal comparison", () => {
  assert.equal(decimalAtLeast("20.000000", "20"), true);
  assert.equal(decimalAtLeast("20.000001", "20"), true);
  assert.equal(decimalAtLeast("19.999999", "20"), false);
  assert.equal(decimalAtLeast("abc", "20"), false);
  assert.equal(decimalAtLeast("-1", "20"), false);
});
test("transaction hashes and checkout URLs are canonical and provider-bound", () => {
  const hash = "ABCDEF" + "1".repeat(58);
  assert.equal(normalizeTxHash("trx_tron", `0x${hash}`), hash.toLowerCase());
  assert.equal(normalizeTxHash("usdt_bep20", hash), `0x${hash.toLowerCase()}`);
  assert.equal(normalizeTxHash("usdt_bep20", "not-a-hash"), "");
  assert.equal(validCheckoutUrl("plisio", "https://plisio.net/invoice/abc"), "https://plisio.net/invoice/abc");
  assert.equal(validCheckoutUrl("plisio", "https://evil.example/invoice/abc"), "");
  assert.equal(validCheckoutUrl("nowpayments", "https://nowpayments.io/payment/?iid=1"), "https://nowpayments.io/payment/?iid=1");
});
test("provider sync parsers reject mismatched payments before settlement", () => {
  const order = { id: 42, userId: 7, method: "provider", provider: "nowpayments", asset: "usdt_trc20", network: "TRON · TRC20", amountUsd: 2000, payAmount: "20", payAddress: "TAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", checkoutUrl: "", qrCode: "", providerPaymentId: "pay-1", txHash: "", status: "pending", providerStatus: "", adminNote: "", verifiedAmount: "", explorerUrl: "", expiresAt: null, submittedAt: null, reviewedBy: null, reviewedAt: null, createdAt: new Date() } as never;
  const now = parseNowPaymentsStatus({ payment_id: "pay-1", order_id: "42", payment_status: "finished", pay_address: "TAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", price_amount: 20, price_currency: "usd", pay_amount: 20, actually_paid: 20, pay_currency: "usdttrc20" }, order);
  assert.equal(now.status, "finished"); assert.equal(now.paidAmount, "20");
  assert.throws(() => parseNowPaymentsStatus({ payment_id: "pay-1", order_id: "42", payment_status: "finished", price_amount: 20, price_currency: "usd", pay_currency: "trx", actually_paid: 20 }, order), /mismatch/);
  const plisioOrder = { ...(order as object), provider: "plisio", asset: "usdt_bep20", providerPaymentId: "txn-1" } as never;
  const plisio = parsePlisioOperation({ status: "success", data: { id: "txn-1", status: "mismatch", psys_cid: "USDT_BSC", amount: "50.5", actual_sum: "50.5", params: { order_number: "42", source_currency: "USD", source_amount: "20" } } }, plisioOrder);
  assert.equal(plisio.status, "mismatch"); assert.equal(plisio.paidAmount, "50.5");
  const sparsePlisio = parsePlisioOperation({ status: "success", data: { id: "internal-op-9", txn_id: "txn-1", status: "completed", invoice_total_sum: "50" } }, plisioOrder);
  assert.equal(sparsePlisio.status, "completed"); assert.equal(sparsePlisio.paidAmount, "50");
});
test("receiving addresses and explorer evidence are network-specific", () => {
  const tron = "T" + "A".repeat(33);
  const bsc = "0x" + "a".repeat(40);
  const hash = "b".repeat(64);
  assert.equal(validReceivingAddress("usdt_trc20", tron), true);
  assert.equal(validReceivingAddress("usdt_bep20", tron), false);
  assert.equal(validReceivingAddress("bnb_bep20", bsc), true);
  assert.equal(validExplorerUrl("trx_tron", `https://tronscan.org/#/transaction/${hash}`, hash), true);
  assert.equal(validExplorerUrl("trx_tron", `https://bscscan.com/tx/${hash}`, hash), false);
  assert.equal(validExplorerUrl("usdt_bep20", `https://bscscan.com/tx/${hash}`, hash), true);
  assert.equal(validExplorerUrl("usdt_bep20", `https://evil.example/tx/${hash}`, hash), false);
  assert.equal(validExplorerUrl("trx_tron", `https://tronscan.org/#/transaction/${"c".repeat(64)}`, hash), false);
});
