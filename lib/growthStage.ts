/**
 * 성장 단계 계산 — 순수 함수, AI/Firestore 접근 없음.
 *
 * 입력은 누적 증거 표 총합(users/{uid}.growth.votes) 하나뿐이다. 단계 이름은
 * i18n 키(growth.stage.0 … growth.stage.5)로만 존재한다 — lib/homeMode.ts 가 표시
 * 문자열을 갖지 않는 것과 같은 분리. 단계 은유(성장 서사): 씨앗 → 새싹 → 줄기 →
 * 가지 → 나무 → 숲.
 *
 * 임계·이모지·라벨 키를 한 행(GrowthStageDef)으로 묶어 "길이가 같아야 하는 병렬 배열"
 * 불변식을 구조로 없앴다 — 단계를 추가/삭제할 때 이 테이블 한 곳만 고치면 된다.
 * (DictKey 는 type-only import 라 클라이언트/서버 어디서든 안전하다.)
 */
import { toCount } from "@/lib/counters";
import type { DictKey } from "@/lib/i18n";

export interface GrowthStageDef {
  /** 이 단계가 시작되는 누적 표 (오름차순, 첫 행은 0). */
  threshold: number;
  emoji: string;
  labelKey: DictKey;
}

/** 단계 테이블. 하루 평균 ~2표 기준 약 1년 서사 — 마지막 단계(600표)가 대략 10개월~1년. */
export const GROWTH_STAGES: ReadonlyArray<GrowthStageDef> = [
  { threshold: 0, emoji: "🌰", labelKey: "growth.stage.0" },
  { threshold: 20, emoji: "🌱", labelKey: "growth.stage.1" },
  { threshold: 60, emoji: "🌿", labelKey: "growth.stage.2" },
  { threshold: 140, emoji: "🍃", labelKey: "growth.stage.3" },
  { threshold: 300, emoji: "🌳", labelKey: "growth.stage.4" },
  { threshold: 600, emoji: "🌲", labelKey: "growth.stage.5" },
];

export interface GrowthStage extends GrowthStageDef {
  /** 현재 단계 인덱스 (0 = 씨앗 … 마지막 = 숲). */
  index: number;
  /** 정규화된 누적 표 — 표시용은 이 값을 쓴다(소비처에서 재정규화 금지). */
  votes: number;
  /** 다음 단계 임계값(표). 마지막 단계면 null. */
  next: number | null;
  /** 다음 단계까지 남은 표. 마지막 단계면 0. */
  votesToNext: number;
  /** 현재 단계 구간 내 진행률 0~100 (마지막 단계면 100). */
  progressPct: number;
}

export function computeGrowthStage(votes: number): GrowthStage {
  const total = toCount(votes);
  // 오름차순 테이블에서 통과한 마지막 행 = 현재 단계 (threshold[0]=0 이라 항상 >= 0).
  const index = GROWTH_STAGES.filter((s) => total >= s.threshold).length - 1;
  const def = GROWTH_STAGES[index];
  const next = index + 1 < GROWTH_STAGES.length ? GROWTH_STAGES[index + 1].threshold : null;
  return {
    ...def,
    index,
    votes: total,
    next,
    votesToNext: next === null ? 0 : next - total,
    progressPct:
      next === null ? 100 : Math.round(((total - def.threshold) / (next - def.threshold)) * 100),
  };
}

/**
 * 표가 하나도 없으면 null — "0표는 숨김" 정책의 단일 정의.
 * 홈 헤더 칩·체크인 보상 카드·/progress 히어로가 전부 이것 하나만 호출한다.
 */
export function growthStageOf(votes: unknown): GrowthStage | null {
  const total = toCount(votes);
  return total > 0 ? computeGrowthStage(total) : null;
}
