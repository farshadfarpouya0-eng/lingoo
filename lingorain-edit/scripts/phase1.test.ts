import { test } from "node:test";
import assert from "node:assert/strict";
import {
  decryptPayoutAccount,
  encryptPayoutAccount,
  maskPayoutAccount,
} from "../src/lib/payout-crypto";
import { isSlotAvailable } from "../src/lib/time";

const payoutKey = "phase1-test-key-never-use-in-production-2026";
const teacherAvailability = {
  startHour: 9,
  endHour: 12,
  tzOffset: 0,
  workDays: "1,2,3,4,5",
};

test("payout account encryption round-trips and masks sensitive values", () => {
  process.env.PAYOUT_ENCRYPTION_KEY = payoutKey;
  const value = "DE89370400440532013000";
  const encrypted = encryptPayoutAccount(value);
  assert.match(encrypted, /^p1:/);
  assert.equal(decryptPayoutAccount(encrypted), value);
  assert.equal(maskPayoutAccount(encrypted), "•••• 3000");
  assert.notEqual(encryptPayoutAccount(value), encrypted, "each encryption must use a fresh IV");
});

test("legacy plaintext can be migrated and is only masked in normal UI", () => {
  process.env.PAYOUT_ENCRYPTION_KEY = payoutKey;
  assert.equal(decryptPayoutAccount("legacy@example.com"), "legacy@example.com");
  assert.equal(maskPayoutAccount("legacy@example.com"), "•••• .com");
});

test("wrong encryption key fails closed", () => {
  process.env.PAYOUT_ENCRYPTION_KEY = payoutKey;
  const encrypted = encryptPayoutAccount("teacher@example.com");
  process.env.PAYOUT_ENCRYPTION_KEY = `${payoutKey}-wrong`;
  assert.throws(() => decryptPayoutAccount(encrypted));
  assert.equal(maskPayoutAccount(encrypted), "Stored securely · key unavailable");
  process.env.PAYOUT_ENCRYPTION_KEY = payoutKey;
});

test("50-minute lessons can start at :00 or :30 and must fit the available window", () => {
  const atTenThirty = new Date("2026-11-02T09:30:00.000Z");
  assert.equal(isSlotAvailable(atTenThirty, teacherAvailability, 50), true);
  assert.equal(isSlotAvailable(new Date("2026-11-02T09:15:00.000Z"), teacherAvailability, 50), false);
  assert.equal(isSlotAvailable(new Date("2026-11-02T11:30:00.000Z"), teacherAvailability, 50), false);
});
