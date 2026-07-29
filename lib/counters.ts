/**
 * 외부(Firestore 문서 등)에서 읽은 카운터 값을 0 이상 정수로 정규화 — 단일 정의.
 * NaN/음수/소수/숫자 문자열을 전부 같은 규칙으로 받는다. goalSlots·goalStreak·growthStage·
 * 체크인 트랜잭션이 공유하므로, 정규화 정책이 바뀌면 여기 한 곳만 고친다.
 */
export function toCount(raw: unknown): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}
