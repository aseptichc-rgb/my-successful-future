/**
 * 오늘의 실행설계(if-then) 회전 — 홈 DailyPlanCard 와 /api/widget/today 가 공유하는
 * 순수 모듈. 같은 (uid, ymd) 면 항상 같은 플랜이 뽑혀 홈·위젯이 어긋나지 않는다.
 *
 * ⚠️ lib/dailyMotivation.ts 의 hash32 를 import 하면 클라이언트 번들에 firebase-admin 이
 * 딸려 들어온다 — 반드시 이 admin 무의존 순수 구현만 사용할 것.
 */

/** 32-bit FNV-1a 해시. 클라/서버 동일 결과 보장(정수 연산만 사용). */
export function fnv1a(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * 오늘 홈/위젯에 노출할 실행설계 1개를 고른다.
 * - active === false 인 플랜은 제외.
 * - 호출부는 plans 를 안정된 순서(createdAt asc 쿼리 정렬)로 전달해야
 *   클라/서버가 같은 인덱스를 뽑는다.
 * - ymd 시드 회전이라 매일 다른 플랜이 돌아가며 노출된다(플랜 2개 이상일 때).
 */
export function pickTodayPlan<T extends { active?: boolean }>(
  plans: ReadonlyArray<T>,
  uid: string,
  ymd: string,
): T | null {
  const active = plans.filter((p) => p.active !== false);
  if (active.length === 0) return null;
  return active[fnv1a(`${uid}|${ymd}|plan`) % active.length];
}
