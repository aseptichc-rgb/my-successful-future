/**
 * 오늘의 실행설계(if-then) / 오늘 새길 다짐 회전 — 홈·체크인 서버·위젯이 공유하는
 * 순수 모듈. 같은 (uid, ymd) 면 항상 같은 결과가 나와 클라·서버·위젯이 어긋나지 않는다.
 *
 * ⚠️ lib/dailyMotivation.ts 의 hash32 를 import 하면 클라이언트 번들에 firebase-admin 이
 * 딸려 들어온다 — 반드시 이 admin 무의존 순수 구현만 사용할 것.
 */
import { diffKstDays } from "@/lib/kstDate";

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

/** 다짐 회전의 기준일 — 이 날짜부터 하루에 한 칸씩 순환한다. 바꾸면 전 사용자의 회전 위상이 밀린다. */
const AFFIRMATION_ROTATION_EPOCH_YMD = "2026-01-01";

/**
 * 오늘 "따라쓰기" 로 새길 다짐 1개의 인덱스 — 체크인 UI(클라)와 체크인 트랜잭션(서버)이
 * 반드시 같은 값을 계산해야 하므로 이 순수 함수를 양쪽에서 공유한다.
 *
 * 해시 회전(pickTodayPlan)이 아니라 **일자 순환**을 쓰는 이유: 해시는 같은 줄이 연달아
 * 나오고 어떤 줄은 거의 안 뽑힌다. 다짐은 n일이면 n개 전부 한 번씩 새겨져야 한다.
 * 시작 위치만 uid 로 흩어 사용자마다 같은 날 같은 순서가 되지 않게 한다.
 *
 * @param n 저장된 다짐 개수. 0 이하면 0 (호출부가 빈 목록을 걸러내는 것이 정상 경로).
 */
export function pickTodayAffirmationIndex(uid: string, ymd: string, n: number): number {
  if (n <= 0) return 0;
  const day = diffKstDays(AFFIRMATION_ROTATION_EPOCH_YMD, ymd);
  // ymd 형식이 깨지면 diff 가 NaN — 그때는 uid 만으로 고정 인덱스를 준다(체크인이 막히지 않도록).
  const raw = Number.isFinite(day) ? fnv1a(uid) + day : fnv1a(uid);
  // epoch 이전 날짜(음수 day)에서도 0..n-1 로 떨어지도록 유클리드 나머지.
  return ((raw % n) + n) % n;
}
