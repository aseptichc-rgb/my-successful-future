/**
 * "성공한 나의 모습" 다짐 따라쓰기 체크인.
 *
 * 정책:
 *   - 사용자가 미리 설정한 다짐 N개(<=10) 가 매일 placeholder 로 노출된다.
 *   - 모든 다짐을 글자 단위로 정확히 다시 적어 제출하면 "오늘 체크인 성공".
 *   - 같은 날(KST) 이미 체크인한 경우 → no-op (스트릭 중복 증가 방지).
 *   - 어제도 체크인했다면 streak.count += 1, 아니면 1 로 리셋.
 *
 * 보안: 클라이언트는 firestore.rules 에서 affirmationLogs 와 users.affirmationStreak
 *       모두 직접 write 가 막혀 있고, 이 함수가 Admin SDK 트랜잭션으로만 갱신한다.
 *
 * 일치 비교: 양끝 trim + 내부 다중 공백을 단일 공백으로 정규화 후 정확 비교.
 *           (스마트따옴표/유니코드는 그대로 둠 — 다짐을 "그대로 쓰는" 의도가 핵심.)
 */
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase-admin";

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
/**
 * 비교 정규화 시 자르는 한도 — 저장된 다짐 60자 + "10. " 같은 번호 프리픽스(<=4자) 여유.
 * 클라 AFFIRMATION_INPUT_MAX 와 동일한 값을 유지해야 잘림으로 인한 mismatch 가 안 생긴다.
 */
const AFFIRMATION_MAX_LEN = 72;

export class AffirmationCheckinError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "AffirmationCheckinError";
  }
}

/** 비교용 정규화 — 양끝 trim + 연속 공백 1개로. */
function normalizeForCompare(s: string): string {
  return s.trim().replace(/\s+/g, " ").slice(0, AFFIRMATION_MAX_LEN);
}

/**
 * 사용자가 placeholder 의 번호("1. ", "10. " 등) 를 적든 안 적든 둘 다 통과시키기 위해
 * 비교 직전에 선두 번호 프리픽스를 떨어뜨린다. 클라 stripLeadingNumber 와 동일.
 */
function stripLeadingNumber(s: string): string {
  return s.replace(/^\s*\d+\s*[.)\]]\s*/, "");
}

/** YYYY-MM-DD (KST) 의 "어제" 문자열. */
function yesterdayKstYmd(ymd: string): string {
  const [y, m, d] = ymd.split("-").map((s) => parseInt(s, 10));
  if (!y || !m || !d) return "";
  // KST 자정에서 1일 빼기 — Date.UTC 로 일자 산술.
  const ms = Date.UTC(y, m - 1, d) - 86400000;
  const k = new Date(ms);
  return k.toISOString().slice(0, 10);
}

/** KST 기준 오늘 YYYY-MM-DD. */
export function todayKstYmd(date: Date = new Date()): string {
  const k = new Date(date.getTime() + KST_OFFSET_MS);
  return k.toISOString().slice(0, 10);
}

export interface CheckinResult {
  ymd: string;
  /** 이번 호출에서 실제로 새로 체크인됐는지 (false = 같은 날 이미 체크인). */
  newlyCheckedIn: boolean;
  streakCount: number;
  /** 입력 길이가 다짐 개수와 다르거나 한 줄이라도 어긋났을 때 false. */
  matched: boolean;
  /** matched=false 일 때, 어긋난 다짐 인덱스(0-based). */
  mismatchedIndices?: number[];
}

/**
 * 다짐 따라쓰기 체크인.
 * - texts.length 와 stored affirmations 길이가 정확히 같아야 한다.
 * - 각 인덱스의 텍스트가 정규화 후 동일해야 한다.
 */
export async function checkinAffirmations(opts: {
  uid: string;
  ymd: string;
  texts: string[];
}): Promise<CheckinResult> {
  const { uid, ymd } = opts;
  const db = getAdminDb();
  const userRef = db.doc(`users/${uid}`);
  const logRef = db.doc(`users/${uid}/affirmationLogs/${ymd}`);

  return await db.runTransaction(async (tx) => {
    const userSnap = await tx.get(userRef);
    if (!userSnap.exists) {
      throw new AffirmationCheckinError(404, "사용자 프로필을 찾지 못했어요.");
    }
    const userData = userSnap.data() ?? {};
    const storedRaw = Array.isArray(userData.successAffirmations)
      ? (userData.successAffirmations as unknown[])
      : [];
    // 저장본은 번호 없이 보관되고, 비교 시점에만 "1. …" 형식으로 합성한다.
    const storedTexts = storedRaw
      .filter((s): s is string => typeof s === "string")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    if (storedTexts.length === 0) {
      throw new AffirmationCheckinError(
        409,
        "먼저 설정에서 '성공한 나의 모습' 다짐을 한 줄 이상 추가해주세요.",
      );
    }

    // 저장본은 본문만 있고, 사용자가 입력한 본문에서도 선두 번호를 떨어낸 뒤 비교한다.
    const expected = storedTexts.map((t) => normalizeForCompare(stripLeadingNumber(t)));
    const submitted = opts.texts.map((t) => normalizeForCompare(stripLeadingNumber(t)));
    if (submitted.length !== expected.length) {
      return {
        ymd,
        newlyCheckedIn: false,
        streakCount: Number(userData.affirmationStreak?.count ?? 0),
        matched: false,
      };
    }
    const mismatched: number[] = [];
    for (let i = 0; i < expected.length; i++) {
      if (expected[i] !== submitted[i]) mismatched.push(i);
    }
    if (mismatched.length > 0) {
      return {
        ymd,
        newlyCheckedIn: false,
        streakCount: Number(userData.affirmationStreak?.count ?? 0),
        matched: false,
        mismatchedIndices: mismatched,
      };
    }

    const logSnap = await tx.get(logRef);
    if (logSnap.exists) {
      // 같은 날 두 번째 호출 — 스트릭은 그대로 두고 matched=true 만 반환.
      return {
        ymd,
        newlyCheckedIn: false,
        streakCount: Number(userData.affirmationStreak?.count ?? 0),
        matched: true,
      };
    }

    const prevStreak = userData.affirmationStreak as
      | { count?: number; lastYmd?: string }
      | undefined;
    const yesterday = yesterdayKstYmd(ymd);
    const prevCount = Number(prevStreak?.count ?? 0);
    const prevLast = typeof prevStreak?.lastYmd === "string" ? prevStreak.lastYmd : "";
    const nextCount = prevLast === yesterday && prevCount > 0 ? prevCount + 1 : 1;

    const now = Timestamp.now();
    tx.set(logRef, {
      ymd,
      checkedInAt: now,
      affirmationCount: storedTexts.length,
    });
    tx.update(userRef, {
      affirmationStreak: {
        count: nextCount,
        lastYmd: ymd,
        updatedAt: FieldValue.serverTimestamp(),
      },
    });

    return {
      ymd,
      newlyCheckedIn: true,
      streakCount: nextCount,
      matched: true,
    };
  });
}
