/**
 * D1 / D7 리텐션과 이벤트별 집계 — 순수 함수. /api/admin/stats 가 Firestore 에서 읽은
 * 원시 행을 넘기고, 결과만 화면에 보낸다.
 *
 * 정의(KST 달력일 기준, lib/kstDate diffKstDays):
 *   D1 = 가입 다음 날(정확히 +1일)에 app_open 이 있는가.
 *   D7 = 가입 후 7일째부터 13일째 사이에 한 번이라도 app_open 이 있는가.
 *       표본이 작을 때 "정확히 7일째" 는 하루만 빠져도 0 이 되므로 한 주 창을 쓴다.
 *
 * 분모는 "판정 가능한 가입자" 만이다 — D7 은 가입 후 아직 7일이 안 된 사람을 세면 안 된다.
 * 그래서 호출부는 today 를 넘기고, 각 지표는 window 가 닫힌 사용자만 센다.
 */
import { diffKstDays } from "@/lib/kstDate";

export interface RetentionUser {
  uid: string;
  /** 가입일 KST YYYY-MM-DD. */
  createdYmd: string;
}

export interface OpenRow {
  uid: string;
  /** app_open 이 찍힌 KST YYYY-MM-DD. */
  day: string;
}

export interface RetentionBucket {
  /** 판정 가능한 가입자 수(분모). */
  eligible: number;
  /** 그중 돌아온 사람 수(분자). */
  returned: number;
  /** returned / eligible. eligible 0 이면 null. */
  rate: number | null;
}

export interface RetentionSummary {
  d1: RetentionBucket;
  d7: RetentionBucket;
}

export const D1_OFFSET_DAYS = 1;
export const D7_WINDOW_START = 7;
export const D7_WINDOW_END = 13;

function bucket(eligible: number, returned: number): RetentionBucket {
  return { eligible, returned, rate: eligible > 0 ? returned / eligible : null };
}

export function computeRetention(
  users: ReadonlyArray<RetentionUser>,
  opens: ReadonlyArray<OpenRow>,
  todayYmd: string,
): RetentionSummary {
  const daysByUid = new Map<string, Set<string>>();
  for (const o of opens) {
    const set = daysByUid.get(o.uid) ?? new Set<string>();
    set.add(o.day);
    daysByUid.set(o.uid, set);
  }

  let d1Eligible = 0;
  let d1Returned = 0;
  let d7Eligible = 0;
  let d7Returned = 0;

  for (const u of users) {
    const age = diffKstDays(u.createdYmd, todayYmd);
    const days = daysByUid.get(u.uid);
    const offsets = new Set<number>();
    if (days) {
      for (const d of days) offsets.add(diffKstDays(u.createdYmd, d));
    }

    if (age > D1_OFFSET_DAYS) {
      d1Eligible += 1;
      if (offsets.has(D1_OFFSET_DAYS)) d1Returned += 1;
    }
    if (age > D7_WINDOW_END) {
      d7Eligible += 1;
      let hit = false;
      for (const off of offsets) {
        if (off >= D7_WINDOW_START && off <= D7_WINDOW_END) {
          hit = true;
          break;
        }
      }
      if (hit) d7Returned += 1;
    }
  }

  return { d1: bucket(d1Eligible, d1Returned), d7: bucket(d7Eligible, d7Returned) };
}

export interface EventRow {
  uid: string;
  name: string;
  /** createdAt(ms). */
  at: number;
}

export interface EventWindowCount {
  count: number;
  users: number;
}

export interface EventCount {
  name: string;
  last7d: EventWindowCount;
  last30d: EventWindowCount;
}

/** 이벤트 이름별 7일/30일 건수와 고유 사용자 수. names 순서대로, 0건도 포함해 돌려준다. */
export function countEvents(
  rows: ReadonlyArray<EventRow>,
  names: ReadonlyArray<string>,
  nowMs: number,
): EventCount[] {
  const day = 24 * 60 * 60 * 1000;
  const since7 = nowMs - 7 * day;
  const since30 = nowMs - 30 * day;
  const acc = new Map<string, { c7: number; u7: Set<string>; c30: number; u30: Set<string> }>();
  for (const n of names) acc.set(n, { c7: 0, u7: new Set(), c30: 0, u30: new Set() });

  for (const r of rows) {
    const a = acc.get(r.name);
    if (!a || r.at < since30) continue;
    a.c30 += 1;
    a.u30.add(r.uid);
    if (r.at >= since7) {
      a.c7 += 1;
      a.u7.add(r.uid);
    }
  }

  return names.map((name) => {
    const a = acc.get(name)!;
    return {
      name,
      last7d: { count: a.c7, users: a.u7.size },
      last30d: { count: a.c30, users: a.u30.size },
    };
  });
}
