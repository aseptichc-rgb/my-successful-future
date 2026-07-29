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
 *
 * gap 판정은 lib/affirmationCheckin 의 스트릭과 같은 규칙(diffKstDays, gap<=0 no-op) —
 * qDate 딥링크로 과거 날짜가 뒤늦게 정산돼도 같은 구간을 두 번 세지 않는다.
 */
import { diffKstDays } from "@/lib/kstDate";
import type { GoalStreak } from "@/types";

/** 서버가 쓰는 순수 결과 형태 — updatedAt(Timestamp)은 트랜잭션이 따로 붙인다. */
export interface GoalStreakState {
  /** 현재 연속일. 달성 없는 날이 정산되면 0으로 끊긴다. */
  count: number;
  /** 역대 최고 연속일 — 슬롯 해금의 유일한 판정값. */
  bestCount: number;
  /** 목표를 1개 이상 달성한 날의 누적 수 (연속과 무관). */
  totalDays: number;
  /** 마지막으로 달성이 정산된 날짜 (KST YYYY-MM-DD). 정산 이력이 없으면 "". */
  lastYmd: string;
}

/** 비정상 입력(NaN/음수/소수)을 0 이상 정수로 정규화. */
function toCount(raw: unknown): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/** 레거시/부분 문서를 안전한 상태로 정규화 — bestCount 누락 시 count 폴백(전사 스트릭과 동일 규칙). */
export function normalizeGoalStreak(prev?: Partial<GoalStreak> | null): GoalStreakState {
  const count = toCount(prev?.count);
  return {
    count,
    bestCount: Math.max(toCount(prev?.bestCount), count),
    totalDays: toCount(prev?.totalDays),
    lastYmd: typeof prev?.lastYmd === "string" ? prev.lastYmd : "",
  };
}

/**
 * 어제(ymd)의 달성 수(achievedCount)를 정산한 다음 상태.
 * 변화가 없으면 정규화된 prev 를 그대로 돌려준다 — 호출부는 prev 와 필드 비교로
 * 쓰기 생략을 판단할 수 있다.
 */
export function nextGoalStreak(
  prev: Partial<GoalStreak> | null | undefined,
  ymd: string,
  achievedCount: number,
): GoalStreakState {
  const base = normalizeGoalStreak(prev);
  const achieved = toCount(achievedCount);

  if (achieved <= 0) {
    // 달성 없는 날의 정산 — lastYmd(마지막 달성일)보다 뒤라면 연속이 확정적으로 끊겼다.
    // lastYmd 는 되돌리지 않는다(되돌리면 같은 구간을 다음 정산이 또 셀 수 있다).
    const gap = base.lastYmd ? diffKstDays(base.lastYmd, ymd) : NaN;
    if (Number.isFinite(gap) && gap > 0 && base.count > 0) {
      return { ...base, count: 0 };
    }
    return base;
  }

  if (base.lastYmd) {
    const gap = diffKstDays(base.lastYmd, ymd);
    // 방어: 같은 날 재정산·qDate 역순 정산·깨진 ymd — no-op (중복 카운트 방지).
    if (!Number.isFinite(gap) || gap <= 0) return base;
    const count = gap === 1 && base.count > 0 ? base.count + 1 : 1;
    return {
      count,
      bestCount: Math.max(base.bestCount, count),
      totalDays: base.totalDays + 1,
      lastYmd: ymd,
    };
  }

  // 최초 정산.
  return {
    count: 1,
    bestCount: Math.max(base.bestCount, 1),
    totalDays: base.totalDays + 1,
    lastYmd: ymd,
  };
}
