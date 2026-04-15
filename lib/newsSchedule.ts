/**
 * 페르소나별 뉴스 자동 수집 일일 스케줄 생성기.
 *
 * 요구사항:
 *  - 각 페르소나는 하루 2번 뉴스를 수집한다.
 *  - 수집 시각은 매일 KST 07:00~18:00 사이에서 "랜덤"하게 결정된다.
 *  - 단, 같은 (날짜, 페르소나) 조합이면 항상 같은 시각이 나와야 한다 (멱등성).
 *    → 크론이 시간마다 호출돼도 매번 새 스케줄이 만들어지면 안 됨.
 *  - 두 슬롯 사이는 최소 2시간 이상 떨어진다 (몰림 방지).
 *
 * 구현: 날짜+페르소나 시드를 기반으로 한 결정론적 PRNG.
 */

import type { BuiltinPersonaId, PersonaNewsSchedule } from "@/types";

// 수집 가능 시간대 (KST 분 단위)
const SLOT_START_MIN = 7 * 60;       // 07:00
const SLOT_END_MIN = 18 * 60;        // 18:00
const MIN_GAP_MIN = 2 * 60;          // 두 슬롯 사이 최소 간격 2시간

/** 현재 KST 기준 YYYY-MM-DD */
export function getKstDateString(now: Date = new Date()): string {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const d = String(kst.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** 현재 KST 기준 자정 이후 분 (0~1439) */
export function getKstMinuteOfDay(now: Date = new Date()): number {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.getUTCHours() * 60 + kst.getUTCMinutes();
}

/** 문자열 → 32bit 해시 (FNV-1a). 외부 의존 없이 결정론적 시드를 만들기 위함. */
function hashSeed(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 — 32bit 시드 PRNG. */
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 결정론적으로 (date, personaId)에 대한 일일 슬롯 2개를 생성한다.
 * 항상 첫 번째 슬롯이 두 번째 슬롯보다 빠르게 정렬된다.
 */
export function buildDailySchedule(
  date: string,
  personaId: BuiltinPersonaId
): PersonaNewsSchedule {
  const rand = mulberry32(hashSeed(`${date}|${personaId}`));
  const range = SLOT_END_MIN - SLOT_START_MIN;

  const slot0 = SLOT_START_MIN + Math.floor(rand() * range);

  // 슬롯1은 슬롯0 ± MIN_GAP_MIN 영역 바깥에서 선택.
  // 가용 영역 = [SLOT_START, slot0-GAP] ∪ [slot0+GAP, SLOT_END]
  const leftLen = Math.max(0, slot0 - MIN_GAP_MIN - SLOT_START_MIN);
  const rightLen = Math.max(0, SLOT_END_MIN - (slot0 + MIN_GAP_MIN));
  const total = leftLen + rightLen;

  let slot1: number;
  if (total <= 0) {
    // 거의 일어나지 않지만 폴백: 끝쪽으로 강제
    slot1 = Math.min(SLOT_END_MIN - 1, slot0 + MIN_GAP_MIN);
  } else {
    const pick = Math.floor(rand() * total);
    slot1 = pick < leftLen
      ? SLOT_START_MIN + pick
      : slot0 + MIN_GAP_MIN + (pick - leftLen);
  }

  const [a, b] = slot0 <= slot1 ? [slot0, slot1] : [slot1, slot0];
  return {
    date,
    personaId,
    slotMinutes: [a, b],
    fetched: [false, false],
  };
}

/**
 * 현재 시각 기준으로 "지금 수집해야 할" 슬롯 인덱스를 반환.
 * - 슬롯 시각이 이미 지났고
 * - 아직 수집되지 않았다면 반환
 * - 둘 다 해당 없으면 null
 */
export function findDueSlot(
  schedule: PersonaNewsSchedule,
  nowMinuteOfDay: number = getKstMinuteOfDay()
): 0 | 1 | null {
  for (let i = 0; i < 2; i++) {
    const idx = i as 0 | 1;
    if (!schedule.fetched[idx] && nowMinuteOfDay >= schedule.slotMinutes[idx]) {
      return idx;
    }
  }
  return null;
}

/** Firestore 문서 ID 규칙 (스케줄 문서) */
export function scheduleDocId(date: string, personaId: BuiltinPersonaId): string {
  return `${date}_${personaId}`;
}
