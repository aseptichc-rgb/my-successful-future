/**
 * 목표 달성 스트릭 집계 — 순수 함수, Firestore 접근 없음.
 *
 * "하루에 목표를 1개 이상 달성한 날"의 연속/누적을 센다. 정산 시점은 체크인 트랜잭션
 * (lib/affirmationCheckin)뿐이고, 판정 대상은 언제나 **어제**의 dailyEntry 다 —
 * 증거 표(goal/win)가 이미 그렇게 동작하므로 같은 하루 지연을 공유한다(트레이드오프:
 * 체크인하지 않은 날은 그 전날의 달성이 영구 미적립 — 체크인이 이 앱의 하루 앵커).
 *
 * 프리즈는 없다 — 슬롯 해금(lib/goalSlots)은 bestCount 만 보므로 끊김이 이미 얻은
 * 칸을 뺏지 않는다("처벌은 재시작을 막는다" 원칙). count 는 스텝업 제안
 * (lib/goalStepUp)의 신선도 판정에만 쓰이므로, 달성 없는 날이 정산되면 0으로 끊어
 * "요즘 잘 지키고 있어요"가 거짓이 되지 않게 한다.
 */
import { diffKstDays } from "@/lib/kstDate";
import { toCount } from "@/lib/counters";
import type { GoalStreak } from "@/types";

/**
 * 서버가 쓰는 순수 결과 형태 — 와이어 타입(GoalStreak)에서 updatedAt(Timestamp)만 뺀
 * 전-필드 확정판. 파생 타입이라 GoalStreak 에 필드가 늘면 여기서 컴파일러가 잡는다.
 */
export type GoalStreakState = Required<Omit<GoalStreak, "updatedAt">>;

/** 레거시/부분 문서를 안전한 상태로 정규화. nextGoalStreak 호출 전에 반드시 거친다. */
export function normalizeGoalStreak(prev?: Partial<GoalStreak> | null): GoalStreakState {
  const count = toCount(prev?.count);
  return {
    count,
    // 정상 문서는 bestCount >= count. max 는 어긋난 문서에서도 기록을 잃지 않는 쪽 —
    // 서버 백필(Math.max(prevBest, nextCount))·bestStreakCount 와 같은 규칙.
    bestCount: Math.max(toCount(prev?.bestCount), count),
    totalDays: toCount(prev?.totalDays),
    lastYmd: typeof prev?.lastYmd === "string" ? prev.lastYmd : "",
  };
}

/**
 * 어제(ymd)의 달성 수(achievedCount)를 정산한 다음 상태.
 * prev 는 normalizeGoalStreak 를 거친 상태여야 하며, 변화가 없으면 **인자를 그대로**
 * 돌려준다 — 호출부는 참조 비교(!==)만으로 쓰기 생략을 판단한다.
 */
export function nextGoalStreak(
  prev: GoalStreakState,
  ymd: string,
  achievedCount: number,
): GoalStreakState {
  const achieved = toCount(achievedCount);

  // gap: 정산 이력이 없으면 null. 같은 날 재정산·qDate 역순 정산·깨진 ymd 는 no-op —
  // affirmationCheckin 의 스트릭 판정과 같은 규칙이라 같은 구간을 두 번 세지 않는다.
  const gap = prev.lastYmd ? diffKstDays(prev.lastYmd, ymd) : null;
  if (gap !== null && (!Number.isFinite(gap) || gap <= 0)) return prev;

  if (achieved <= 0) {
    // 달성 없는 날의 정산 — 마지막 달성일보다 뒤라면 연속이 확정적으로 끊겼다.
    // lastYmd 는 되돌리지 않는다(되돌리면 같은 구간을 다음 정산이 또 셀 수 있다).
    return gap !== null && prev.count > 0 ? { ...prev, count: 0 } : prev;
  }

  // gap === 1 이면 연속 +1, 그 외(첫 정산·공백 후)는 새 run 의 1일째.
  const count = gap === 1 && prev.count > 0 ? prev.count + 1 : 1;
  return {
    count,
    bestCount: Math.max(prev.bestCount, count),
    totalDays: prev.totalDays + 1,
    lastYmd: ymd,
  };
}
