export type LessonDuration = 25 | 50;
export const PACKAGE_PLANS = {
  50: [{ count: 1, discount: 0 }, { count: 5, discount: 5 }, { count: 10, discount: 10 }, { count: 20, discount: 15 }],
  25: [{ count: 1, discount: 0 }, { count: 10, discount: 5 }, { count: 20, discount: 10 }, { count: 40, discount: 15 }],
} as const;
export const money = (cents: number) => `US$${(cents / 100).toFixed(2)}`;
/** Share of the 50-minute price used when a tutor has not set an explicit 25-minute price. */
export const AUTO_PRICE25_RATIO = 0.55;
export function unitLessonPrice(price50: number, duration: LessonDuration, price25?: number | null) {
  if (duration === 25) return price25 && price25 > 0 ? price25 : Math.round(price50 * AUTO_PRICE25_RATIO);
  return price50;
}
/** Integer cents; the client cannot supply the discount or charged price. */
export function quotePackage(price50: number, duration: number, count: number, price25?: number | null) {
  if (duration !== 25 && duration !== 50) throw new Error("plan");
  const plan = PACKAGE_PLANS[duration].find(p => p.count === count);
  if (!plan || !Number.isInteger(price50) || price50 < 1) throw new Error("plan");
  const originalUnitPrice = unitLessonPrice(price50, duration, price25);
  const unitPrice = Math.round(originalUnitPrice * (100 - plan.discount) / 100);
  const totalPrice = unitPrice * count;
  return { duration, count, discount: plan.discount, unitPrice, originalUnitPrice, totalPrice, savings: originalUnitPrice * count - totalPrice };
}
