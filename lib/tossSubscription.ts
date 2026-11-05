export const TOSS_PRO_PRICE_KRW = 990;
export const TOSS_PRO_CYCLE_MS = 30 * 24 * 60 * 60 * 1000;

export function isTossProPrice(displayAmount: string): boolean {
  const amount = displayAmount.replace(/\s/g, '');
  return [`₩${TOSS_PRO_PRICE_KRW}`, `￦${TOSS_PRO_PRICE_KRW}`, `${TOSS_PRO_PRICE_KRW}원`,
    `KRW${TOSS_PRO_PRICE_KRW}`].includes(amount);
}
