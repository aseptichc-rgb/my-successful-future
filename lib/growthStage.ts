/**
 * 성장 단계 계산 — 순수 함수, AI/Firestore 접근 없음.
 *
 * 입력은 누적 증거 표 총합(users/{uid}.growth.votes) 하나뿐이다. 단계 이름은
 * i18n 키(growth.stage.0 … growth.stage.5)로만 존재하고 이 모듈은 인덱스만 돌려준다 —
 * lib/homeMode.ts 가 표시 문자열을 갖지 않는 것과 같은 분리.
 * 단계 은유(성장 서사): 씨앗 → 새싹 → 줄기 → 가지 → 나무 → 숲.
 */
import { GROWTH_STAGE_THRESHOLDS } from "@/lib/constants/growth";
import type { DictKey } from "@/lib/i18n";

/**
 * 단계 인덱스 → i18n 키. 템플릿 리터럴은 DictKey 타입 검증을 못 받으므로 명시 배열
 * (app/progress 의 SOURCE_LABEL_KEY 와 같은 이유). 소비처 3곳(보상 카드·홈 칩·진행
 * 히어로)이 공유한다. 길이는 항상 GROWTH_STAGE_THRESHOLDS 와 같아야 한다.
 */
export const GROWTH_STAGE_LABEL_KEY: ReadonlyArray<DictKey> = [
  "growth.stage.0",
  "growth.stage.1",
  "growth.stage.2",
  "growth.stage.3",
  "growth.stage.4",
  "growth.stage.5",
];

export interface GrowthStage {
  /** 현재 단계 인덱스 (0 = 씨앗 … 마지막 = 숲). i18n 키 growth.stage.{index} 와 1:1. */
  index: number;
  /** 현재 단계의 시작 임계값(표). */
  current: number;
  /** 다음 단계 임계값(표). 마지막 단계면 null. */
  next: number | null;
  /** 다음 단계까지 남은 표. 마지막 단계면 0. */
  votesToNext: number;
  /** 현재 단계 구간 내 진행률 0~100 (마지막 단계면 100). */
  progressPct: number;
}

export function computeGrowthStage(votes: number): GrowthStage {
  const raw = Number(votes);
  const total = Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0;

  let index = 0;
  for (let i = 1; i < GROWTH_STAGE_THRESHOLDS.length; i += 1) {
    if (total >= GROWTH_STAGE_THRESHOLDS[i]) index = i;
  }

  const current = GROWTH_STAGE_THRESHOLDS[index];
  const next =
    index + 1 < GROWTH_STAGE_THRESHOLDS.length ? GROWTH_STAGE_THRESHOLDS[index + 1] : null;

  return {
    index,
    current,
    next,
    votesToNext: next === null ? 0 : next - total,
    progressPct:
      next === null ? 100 : Math.round(((total - current) / (next - current)) * 100),
  };
}
