/**
 * "성공한 나의 모습" 다짐 따라쓰기 체크인.
 *
 * 정책:
 *   - 하루 필수치는 **오늘 회전으로 뽑힌 다짐 1줄**(focus)이다. 그 1줄만 정확히 적으면
 *     체크인 성공 — 하루의 앵커 행동을 가장 싸게 만든다(Fogg B=MAP: Ability↑ → 실행 유지).
 *   - 저장된 다짐을 전량 정확히 적으면 depth="full" — 정체성 증거 보너스 1표.
 *     (다짐이 1개면 focus == 전량이므로 보너스 없음 — 아래 DEEP_MIN_AFFIRMATIONS 가드.)
 *   - focus 는 맞고 "추가로 적은" 줄만 틀린 경우 → 체크인은 성공으로 유지하고
 *     어긋난 인덱스만 돌려준다. 더 하려던 노력을 실패로 처벌하지 않는다.
 *   - 같은 날(KST) 이미 체크인한 경우 → no-op (스트릭 중복 증가 방지).
 *   - 어제도 체크인했다면 streak.count += 1, 아니면 1 로 리셋(프리즈 판정은 아래).
 *
 * 보안: 클라이언트는 firestore.rules 에서 affirmationLogs 와 users.affirmationStreak
 *       모두 직접 write 가 막혀 있고, 이 함수가 Admin SDK 트랜잭션으로만 갱신한다.
 *       제출 본문은 어떤 경로로도 로그에 남기지 않는다(어긋난 인덱스만 반환).
 *
 * 일치 비교: 양끝 trim + 내부 다중 공백을 단일 공백으로 정규화 후 정확 비교.
 *           (스마트따옴표/유니코드는 그대로 둠 — 다짐을 "그대로 쓰는" 의도가 핵심.)
 */
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase-admin";
import { todayKstYmd, diffKstDays, kstMonth } from "@/lib/kstDate";
import { prepareEvidence, applyEvidence, type PreparedEvidence } from "@/lib/identityEvidence";
import { pickTodayAffirmationIndex } from "@/lib/planRotation";
import { FREEZES_PER_MONTH } from "@/lib/constants/streak";
import type { AffirmationCheckinDepth } from "@/types";

// 체크인 라우트가 기존 경로로 계속 임포트할 수 있도록 재수출(단일 정의는 lib/kstDate).
export { todayKstYmd };
// 프리즈 지급량 재수출 — 서버 코드는 기존 경로로 계속 임포트 가능(단일 정의는 constants/streak).
export { FREEZES_PER_MONTH };

/**
 * 비교 정규화 시 자르는 한도 — 저장된 다짐 60자 + "10. " 같은 번호 프리픽스(<=4자) 여유.
 * 클라 AFFIRMATION_INPUT_MAX 와 동일한 값을 유지해야 잘림으로 인한 mismatch 가 안 생긴다.
 */
const AFFIRMATION_MAX_LEN = 72;

/**
 * deep(전량 전사) 보너스를 주는 최소 다짐 개수.
 * 다짐이 1개면 focus 1줄 = 전량이라 매일 자동으로 보너스를 먹게 되므로 2개부터 인정한다.
 */
const DEEP_MIN_AFFIRMATIONS = 2;

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

/** 희소 제출 1건 — 사용자가 실제로 적은 줄만 인덱스와 함께 올린다. */
export interface CheckinEntry {
  index: number;
  text: string;
}

export interface CheckinResult {
  ymd: string;
  /** 이번 호출에서 실제로 새로 체크인됐는지 (false = 같은 날 이미 체크인). */
  newlyCheckedIn: boolean;
  streakCount: number;
  /** 오늘의 focus 줄이 일치했는지 — 체크인 성립 여부와 동의어. */
  matched: boolean;
  /**
   * 어긋난 다짐 인덱스(0-based).
   * matched=false 면 focus 줄이 포함되고, matched=true 인데도 값이 있으면
   * "추가로 적었다가 틀린 줄" 이다 — UI 는 오류가 아니라 안내로 표시할 것.
   */
  mismatchedIndices?: number[];
  /** 오늘 회전으로 뽑힌 다짐 인덱스 — 클라 계산과 어긋날 수 있으므로 이 값이 진리. */
  focusIndex: number;
  /** 이번 체크인의 깊이. full 이면 정체성 증거가 2표(checkin + deep) 적립된다. */
  depth: AffirmationCheckinDepth;
  /** 이번 체크인으로 적립된 오늘분 증거 표 수 (1 = checkin, 2 = checkin + deep). */
  evidenceVotes?: number;
  /** checkin 표가 투표한 정체성 라벨 — 체크인 직후 보상 문구용. 라벨 풀이 없으면 생략. */
  evidenceTag?: string;
  /** 역대 최고 연속일 — 이번 체크인 반영 후 값. */
  bestCount?: number;
  /** 이번 체크인에서 결석을 다리 놓는 데 소비한 프리즈 개수 (0=소비 없음). */
  freezeUsed?: number;
  /** 프리즈로도 못 막아 스트릭이 1로 리셋됐는지 — 클라 재약속 문구 트리거. */
  streakBroken?: boolean;
}

/**
 * 다짐 따라쓰기 체크인.
 * - entries 는 사용자가 실제로 적은 줄만 담는다(희소 제출). 최소 요구치는 focus 1줄.
 * - 각 인덱스의 텍스트가 정규화 후 저장본과 동일해야 그 줄이 "일치" 로 집계된다.
 */
export async function checkinAffirmations(opts: {
  uid: string;
  ymd: string;
  entries: CheckinEntry[];
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
    const focusIndex = pickTodayAffirmationIndex(uid, ymd, expected.length);

    // 제출본을 인덱스 → 정규화 텍스트로 정리. 범위를 벗어난 인덱스는 무시하고,
    // 같은 인덱스가 중복되면 마지막 값을 쓴다(라우트에서 이미 걸러지지만 방어).
    const submitted = new Map<number, string>();
    for (const e of opts.entries) {
      if (!Number.isInteger(e.index) || e.index < 0 || e.index >= expected.length) continue;
      submitted.set(e.index, normalizeForCompare(stripLeadingNumber(e.text)));
    }

    const mismatched: number[] = [];
    let matchedCount = 0;
    for (const [index, text] of submitted) {
      if (expected[index] === text) matchedCount += 1;
      else mismatched.push(index);
    }
    mismatched.sort((a, b) => a - b);

    // focus 줄이 없거나 어긋나면 체크인 불성립 — 쓰기 없이 되돌린다.
    const focusOk = submitted.has(focusIndex) && expected[focusIndex] === submitted.get(focusIndex);
    if (!focusOk) {
      return {
        ymd,
        newlyCheckedIn: false,
        streakCount: Number(userData.affirmationStreak?.count ?? 0),
        matched: false,
        mismatchedIndices: mismatched.includes(focusIndex)
          ? mismatched
          : [focusIndex, ...mismatched].sort((a, b) => a - b),
        focusIndex,
        depth: "focus",
      };
    }

    // 전량 전사 판정 — 모든 줄을 제출했고 전부 일치했을 때만 full.
    const depth: AffirmationCheckinDepth =
      matchedCount === expected.length && expected.length >= DEEP_MIN_AFFIRMATIONS
        ? "full"
        : "focus";

    const logSnap = await tx.get(logRef);
    if (logSnap.exists) {
      // 같은 날 두 번째 호출 — 스트릭/증거는 그대로 두고 성공만 반환.
      // depth 는 최초 체크인 시점의 기록을 진리로 삼는다(나중에 전량을 적어도 표는 늘지 않는다).
      return {
        ymd,
        newlyCheckedIn: false,
        streakCount: Number(userData.affirmationStreak?.count ?? 0),
        matched: true,
        mismatchedIndices: mismatched.length > 0 ? mismatched : undefined,
        focusIndex,
        depth: (logSnap.get("depth") as AffirmationCheckinDepth | undefined) ?? "full",
      };
    }

    // ── 스트릭/프리즈 판정 ──
    // 프리즈 의미론: 결석(gap>=2) 후 "다음 체크인 시점"에 자동 소비되어 스트릭을 잇는다.
    // 놓친 날 자체는 +1 되지 않는다(오늘 하루만 +1). 월 경계에 걸친 gap 은 체크인한 달의
    // 잔여분에서 차감한다(단순화 — 단일 작성자 트랜잭션이라 경쟁 없음).
    const prevStreak = userData.affirmationStreak as
      | {
          count?: number;
          lastYmd?: string;
          bestCount?: number;
          freezesLeft?: number;
          freezeMonth?: string;
          lastBrokenYmd?: string;
          lastBrokenCount?: number;
        }
      | undefined;
    const prevCount = Number(prevStreak?.count ?? 0);
    const prevLast = typeof prevStreak?.lastYmd === "string" ? prevStreak.lastYmd : "";
    // 레거시 문서(bestCount 없음)는 현재 count 를 최고기록으로 간주해 백필한다.
    const prevBest = Number(prevStreak?.bestCount ?? prevCount);
    const month = kstMonth(ymd);
    // 지연 리필: freezeMonth 가 이번 달이 아니면 월초 지급량으로 리셋된 것으로 본다.
    let freezesLeft =
      prevStreak?.freezeMonth === month
        ? Math.max(0, Number(prevStreak?.freezesLeft ?? FREEZES_PER_MONTH))
        : FREEZES_PER_MONTH;

    let nextCount: number;
    let nextLastYmd = ymd;
    let freezeUsed = 0;
    let streakBroken = false;
    let brokenYmd: string | undefined;
    let brokenCount: number | undefined;

    if (prevCount <= 0 || !prevLast) {
      nextCount = 1; // 최초 체크인 (또는 리셋 후 첫 체크인)
    } else {
      const gap = diffKstDays(prevLast, ymd);
      if (!Number.isFinite(gap) || gap <= 0) {
        // 방어: lastYmd 가 미래/오늘/깨진 형식(qDate 딥링크로 과거 날짜 체크인 포함) —
        // 카운트는 no-op 유지, lastYmd 도 뒤로 되돌리지 않는다(되돌리면 같은 구간을
        // 다음 체크인이 또 +1 하는 스트릭 부풀리기가 가능해진다).
        nextCount = prevCount;
        nextLastYmd = prevLast;
      } else if (gap === 1) {
        nextCount = prevCount + 1; // 어제 이어서 — 기존과 동일
      } else {
        const missed = gap - 1;
        if (missed <= freezesLeft) {
          // 프리즈로 결석일을 다리 놓아 스트릭을 잇는다.
          freezeUsed = missed;
          freezesLeft -= missed;
          nextCount = prevCount + 1;
        } else {
          // 프리즈로도 못 막음 — 리셋하되 직전 기록은 재약속 문구용으로 보존.
          streakBroken = true;
          nextCount = 1;
          brokenYmd = ymd;
          brokenCount = prevCount;
        }
      }
    }
    const bestCount = Math.max(prevBest, nextCount);

    // ── 정체성 증거 적립 준비 (트랜잭션 읽기 단계 — 모든 쓰기 전에 완료해야 한다) ──
    // 증거 실패가 체크인을 실패시키면 안 되므로 자체 try-catch 로 격리한다.
    let evidence: PreparedEvidence | null = null;
    try {
      const labels = Array.isArray(userData.identities?.labels)
        ? (userData.identities.labels as string[])
        : [];
      evidence = await prepareEvidence(tx, { uid, ymd, labels, deep: depth === "full" });
    } catch (err) {
      console.error("[affirmationCheckin] 증거 적립 준비 실패(체크인은 계속):", err);
      evidence = null;
    }

    // ── 쓰기 단계 ──
    const now = Timestamp.now();
    tx.set(logRef, {
      ymd,
      checkedInAt: now,
      affirmationCount: storedTexts.length,
      // 신규 필드 — 레거시 문서엔 없다. 읽는 쪽은 `depth ?? "full"` 로 폴백한다.
      depth,
      focusIndex,
    });
    // ⚠️ Firestore 는 undefined 값을 거부한다 — 선택 필드는 값이 있을 때만 키를 넣는다.
    const nextStreak: Record<string, unknown> = {
      count: nextCount,
      lastYmd: nextLastYmd,
      bestCount,
      freezesLeft,
      freezeMonth: month,
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (streakBroken) {
      nextStreak.lastBrokenYmd = brokenYmd;
      nextStreak.lastBrokenCount = brokenCount;
    } else {
      // 끊긴 적 있던 기록은 보존 (재약속 카드가 과거 기록을 계속 참조할 수 있게).
      if (typeof prevStreak?.lastBrokenYmd === "string") {
        nextStreak.lastBrokenYmd = prevStreak.lastBrokenYmd;
      }
      if (typeof prevStreak?.lastBrokenCount === "number") {
        nextStreak.lastBrokenCount = prevStreak.lastBrokenCount;
      }
    }
    tx.update(userRef, { affirmationStreak: nextStreak });

    if (evidence) {
      try {
        applyEvidence(tx, evidence);
      } catch (err) {
        console.error("[affirmationCheckin] 증거 적립 쓰기 실패(체크인은 계속):", err);
      }
    }

    return {
      ymd,
      newlyCheckedIn: true,
      streakCount: nextCount,
      matched: true,
      // focus 는 맞았는데 추가로 적은 줄이 틀린 경우 — 성공을 유지하고 안내만 돌려준다.
      mismatchedIndices: mismatched.length > 0 ? mismatched : undefined,
      focusIndex,
      depth,
      // 증거 적립이 실패(격리된 try-catch)했다면 보상 문구도 붙이지 않는다.
      ...(evidence
        ? {
            evidenceVotes: evidence.deepEntry ? 2 : 1,
            evidenceTag: evidence.checkinEntry.identityTag,
          }
        : {}),
      bestCount,
      freezeUsed,
      streakBroken,
    };
  });
}
