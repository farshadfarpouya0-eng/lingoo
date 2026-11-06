import test from "node:test";
import assert from "node:assert/strict";
import { decodeMaterial, materialAssetReference } from "../src/lib/material-content";
import { decimalAtLeast, validExplorerUrl, validReceivingAddress } from "../src/lib/crypto-networks";

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
