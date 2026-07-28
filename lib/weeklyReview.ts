/**
 * 주간 회고 집계 — 순수 함수 모듈(클라/서버 무관, Firestore 접근 없음).
 *
 * 사용자에게 아무 입력도 요구하지 않고 이미 쌓인 데이터만 되돌려준다:
 * 자기 모니터링(self-monitoring)은 BCT 메타분석에서 효과 최상위 기법이고,
 * 주간 단위 회고는 하루 단위 피드백이 놓치는 "추세"를 보여준다.
 *
 * LLM 을 쓰지 않는 이유: 쿼터·지연·실패 모드를 늘리지 않고, 오프라인에서도
 * 같은 숫자가 나와야 한다. 문구는 i18n 템플릿이 담당한다.
 *
 * 데이터 출처는 전부 기존 조회 함수 — getAffirmationLogYmds(체크인 날짜),
 * getIdentityEvidenceRange(증거 장부), getDailyWinsHistory(잘한 일). 신규 쿼리 없음.
 */
import { addKstDays } from "@/lib/kstDate";
import type { IdentityEvidenceDay } from "@/types";

/** 회고 창 길이(일) — 오늘을 포함한 7일. */
export const WEEKLY_REVIEW_DAYS = 7;

export interface WeeklyReview {
  /** 창의 시작일 (KST YYYY-MM-DD, 포함). */
  from: string;
  /** 창의 종료일 = 기준일 (KST YYYY-MM-DD, 포함). */
  to: string;
  /** 이 주에 체크인한 날 수 (0..7). */
  checkinDays: number;
  /** 이 주에 기록한 "잘한 일" 총 개수. */
  winCount: number;
  /** 이 주에 적립된 정체성 증거 표 총합. */
  evidenceVotes: number;
  /** 이 주 가장 많은 표를 받은 정체성 라벨 — 표가 하나도 없으면 null. */
  topIdentity: string | null;
  /** topIdentity 가 받은 표 수. */
  topIdentityVotes: number;
}

/** 창 시작일 계산 — 호출부(조회 범위)와 집계가 같은 경계를 쓰도록 노출한다. */
export function weeklyReviewFrom(toYmd: string): string {
  return addKstDays(toYmd, -(WEEKLY_REVIEW_DAYS - 1));
}

/**
 * 조회 결과 3종을 창 안으로 필터링해 한 주를 요약한다.
 * 입력 배열은 창보다 넓어도 되고(여기서 걸러낸다), 형식이 깨진 항목은 조용히 무시한다.
 */
export function buildWeeklyReview(input: {
  /** 체크인한 날짜 목록 (getAffirmationLogYmds). */
  checkinYmds: ReadonlyArray<string>;
  /** 증거 장부 (getIdentityEvidenceRange). */
  evidenceDays: ReadonlyArray<IdentityEvidenceDay>;
  /** 잘한 일 히스토리 (getDailyWinsHistory). */
  winsHistory: ReadonlyArray<{ ymd: string; wins: string[] }>;
  /** 기준일 = 창의 마지막 날 (보통 오늘). */
  toYmd: string;
}): WeeklyReview {
  const to = input.toYmd;
  const from = weeklyReviewFrom(to);
  const inWindow = (ymd: unknown): boolean =>
    typeof ymd === "string" && ymd >= from && ymd <= to;

  // 같은 날짜가 중복돼도 하루로 센다(문서 ID 기준이라 정상 경로에선 유일하지만 방어).
  const checkinDays = new Set(input.checkinYmds.filter(inWindow)).size;

  const winCount = input.winsHistory
    .filter((d) => inWindow(d.ymd))
    .reduce(
      (sum, d) =>
        sum + (Array.isArray(d.wins) ? d.wins.filter((w) => w.trim().length > 0).length : 0),
      0,
    );

  const votesByTag = new Map<string, number>();
  let evidenceVotes = 0;
  for (const day of input.evidenceDays) {
    if (!inWindow(day.ymd)) continue;
    const entries = Array.isArray(day.entries) ? day.entries : [];
    for (const entry of entries) {
      const tag = typeof entry?.identityTag === "string" ? entry.identityTag.trim() : "";
      if (!tag) continue;
      evidenceVotes += 1;
      votesByTag.set(tag, (votesByTag.get(tag) ?? 0) + 1);
    }
  }

  // 동수일 때 순서가 흔들리지 않도록 표 수 내림차순 → 라벨 오름차순으로 결정론적 선택.
  let topIdentity: string | null = null;
  let topIdentityVotes = 0;
  for (const [tag, n] of [...votesByTag.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  )) {
    topIdentity = tag;
    topIdentityVotes = n;
    break;
  }

  return { from, to, checkinDays, winCount, evidenceVotes, topIdentity, topIdentityVotes };
}
