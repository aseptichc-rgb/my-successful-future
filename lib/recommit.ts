/**
 * 스트릭 공백 판정 — 재약속 카드(components/home/RecommitCard)의 두 변형을 고르는 순수 함수.
 *
 *  · freezeChip: 놓친 날 수 <= 남은 프리즈 → "체크인하면 얼음이 이어줘요" 안내 칩.
 *  · recommit  : 프리즈로도 못 막는 공백 → 자기연민 재약속 카드
 *                (Breines & Chen 2012 — 자기연민이 자존감 부양보다 개선 동기를 높인다).
 *
 * 클라이언트 gap 판정이다 — 실제 스트릭 갱신은 서버 트랜잭션에서만 일어난다.
 * 알림 슬롯(lib/homeNotice)이 자격 판정에, 카드가 렌더에 같은 결과를 쓴다.
 */
import { diffKstDays, kstMonth } from "@/lib/kstDate";
import { FREEZES_PER_MONTH } from "@/lib/constants/streak";
import type { AffirmationStreak } from "@/types";

export type RecommitVariant =
  | { kind: "none" }
  | { kind: "freezeChip"; missed: number }
  | { kind: "recommit"; prev: number; best: number };

/** 어제 체크인(gap=1)까지는 정상 흐름 — 이틀 이상 벌어졌을 때만 카드가 뜬다. */
const MIN_GAP_DAYS = 2;

export function computeRecommitVariant({
  streak,
  todayYmd,
  alreadyCheckedInToday,
}: {
  streak: AffirmationStreak | undefined;
  todayYmd: string;
  /** 오늘 이미 체크인했다면 카드를 띄울 이유가 없다. */
  alreadyCheckedInToday: boolean;
}): RecommitVariant {
  const count = streak?.count ?? 0;
  const lastYmd = streak?.lastYmd ?? "";
  if (count <= 0 || !lastYmd || alreadyCheckedInToday) return { kind: "none" };

  const gap = diffKstDays(lastYmd, todayYmd);
  if (!Number.isFinite(gap) || gap < MIN_GAP_DAYS) return { kind: "none" };

  const missed = gap - 1;
  // 이번 달 프리즈가 아니면 월초 리필로 간주(지연 리필) — 서버와 같은 규칙.
  const freezesLeft =
    streak?.freezeMonth === kstMonth(todayYmd)
      ? Math.max(0, streak?.freezesLeft ?? FREEZES_PER_MONTH)
      : FREEZES_PER_MONTH;

  if (missed <= freezesLeft) return { kind: "freezeChip", missed };

  // 레거시 문서(bestCount 없음)는 현재 count 를 최고기록으로 간주 — 서버 백필과 동일 폴백.
  const best = Math.max(streak?.bestCount ?? count, count);
  return { kind: "recommit", prev: count, best };
}
