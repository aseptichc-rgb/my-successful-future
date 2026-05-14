/**
 * GET /api/widget/today
 *
 * 안드로이드 위젯/메인 앱이 한 번 호출로 받아가는 "오늘의 카드" 응답.
 *
 * 응답 구성:
 *   slots[0]       = 오늘의 동기부여 카드 (개인화 한 마디 / dailyMotivation)
 *   todayProgress  = 다짐/행동/잘한일 3가지 이행 여부
 *
 * 정책: 웹 /home 화면이 dailyMotivation 한 장만 노출하므로 위젯도 같은 한 장만 보여준다.
 *       과거에 슬롯 회전(8개)이 있었으나, 위젯-홈 불일치만 만들고 사실상 사용되지 않아 단순화.
 *
 * 인증: Authorization: Bearer <Firebase ID Token>. uid 위장 불가.
 */
import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { requirePaidUser, AuthError } from "@/lib/authServer";
import { enforceQuota, QuotaExceededError } from "@/lib/quota";
import {
  KST_OFFSET_MS,
  ensureMotivation,
  isValidYmd,
  todayKst,
} from "@/lib/dailyMotivation";
import type {
  WidgetSlot,
  WidgetTodayProgress,
  WidgetTodayResponse,
} from "@/types";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const REQUIRED_WINS = 3;

/**
 * 홈에서 사용자가 오늘 이행한 3가지 작업의 완료 여부를 모아 반환.
 * 각 조회는 독립적이므로 한 곳이 실패해도 다른 항목은 영향 없도록 try-catch 로 격리.
 * 실패 시 해당 항목은 false 로 안전 폴백 — 위젯이 "미완료" 상태로 보이는 게
 * "있다고 잘못 표시" 보다 안전하다.
 */
async function fetchTodayProgress(
  uid: string,
  ymd: string,
  userGoals: string[] | undefined,
): Promise<WidgetTodayProgress> {
  const db = getAdminDb();
  const userDocRef = db.collection("users").doc(uid);

  const affirmationSafe = async (): Promise<boolean> => {
    try {
      const snap = await userDocRef.collection("affirmationLogs").doc(ymd).get();
      return snap.exists;
    } catch (err) {
      console.error("[widget/today] affirmation 진척도 조회 실패:", err);
      return false;
    }
  };

  const dailyEntrySafe = async (): Promise<{ wins: string[]; achievedGoals: string[] }> => {
    try {
      const snap = await userDocRef.collection("dailyEntries").doc(ymd).get();
      if (!snap.exists) return { wins: [], achievedGoals: [] };
      const data = snap.data() ?? {};
      const wins = Array.isArray(data.wins) ? (data.wins as unknown[]) : [];
      const achievedGoals = Array.isArray(data.achievedGoals) ? (data.achievedGoals as unknown[]) : [];
      return {
        wins: wins.map((w) => (typeof w === "string" ? w.trim() : "")),
        achievedGoals: achievedGoals
          .map((g) => (typeof g === "string" ? g.trim() : ""))
          .filter((g) => g.length > 0),
      };
    } catch (err) {
      console.error("[widget/today] dailyEntry 진척도 조회 실패:", err);
      return { wins: [], achievedGoals: [] };
    }
  };

  const [affirmation, entry] = await Promise.all([affirmationSafe(), dailyEntrySafe()]);

  const goals = Array.isArray(userGoals)
    ? userGoals.map((g) => (typeof g === "string" ? g.trim() : "")).filter((g) => g.length > 0)
    : [];
  const achievedSet = new Set(entry.achievedGoals);
  const actions = goals.length > 0 && goals.every((g) => achievedSet.has(g));

  const winsFilled = entry.wins.filter((w) => w.length > 0).length;
  const wins = winsFilled >= REQUIRED_WINS;

  return { affirmation, actions, wins };
}

/** KST 다음 자정의 ISO timestamp — 위젯 다음 갱신 시각 hint. */
function nextRefreshIso(now: Date): string {
  const kst = new Date(now.getTime() + KST_OFFSET_MS);
  const tomorrowKstMidnight = Date.UTC(
    kst.getUTCFullYear(),
    kst.getUTCMonth(),
    kst.getUTCDate() + 1,
  );
  return new Date(tomorrowKstMidnight - KST_OFFSET_MS).toISOString();
}

export async function GET(request: NextRequest) {
  try {
    // 결제 게이팅: ENTITLEMENT_REQUIRED=true 운영에서 미결제 사용자 차단.
    // 개발/베타에서는 통과시키되 user.paid 로 다운그레이드 응답을 줄 수 있다(현재는 동일 응답).
    const me = await requirePaidUser(request);

    // 일별 호출 한도 (KST 자정 기준 widgetRefresh 카운트). 초과 시 429.
    await enforceQuota(me.uid, "widgetRefresh");

    const url = new URL(request.url);
    const ymdParam = url.searchParams.get("ymd");
    const ymd = ymdParam && isValidYmd(ymdParam) ? ymdParam : todayKst();

    // 1) 오늘의 개인화 카드 보장 (없으면 생성)
    const { motivation } = await ensureMotivation({ uid: me.uid, ymd });

    // 2) 진척도 수집. home 의 "오늘 행동 체크" 와 일치하도록 user.goals 를 실시간으로 읽는다.
    let userGoals: string[] | undefined;
    try {
      const userSnap = await getAdminDb().collection("users").doc(me.uid).get();
      const data = userSnap.data();
      if (data && Array.isArray(data.goals)) {
        userGoals = data.goals as string[];
      }
    } catch (err) {
      console.error("[widget/today] user.goals 조회 실패:", err);
    }
    const todayProgress = await fetchTodayProgress(me.uid, ymd, userGoals);

    // 3) 슬롯 조립 — motivation 한 장만 노출 (홈과 동일).
    const motivationSlot: WidgetSlot = {
      kind: "motivation",
      text: motivation.quote,
      author: motivation.author,
      ...(motivation.source ? { source: motivation.source } : {}),
      ...(motivation.originalText && motivation.originalLang
        ? {
            originalText: motivation.originalText,
            originalLang: motivation.originalLang,
          }
        : {}),
      goalsSnapshot: motivation.goalsSnapshot,
      gradient: motivation.gradient,
    };

    const now = new Date();
    const body: WidgetTodayResponse = {
      generatedAt: now.toISOString(),
      ymd,
      currentSlotIndex: 0,
      slots: [motivationSlot],
      nextRefreshAt: nextRefreshIso(now),
      todayProgress,
    };

    return NextResponse.json(body, {
      headers: {
        // CDN 짧게 캐시(같은 uid 기준). 위젯은 매 호출 본인 토큰을 실어 보내므로 사용자 분리는 토큰 검증으로 보장.
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    if (err instanceof QuotaExceededError) {
      return NextResponse.json(
        { error: err.message, code: "quota_exceeded", limit: err.limit },
        { status: 429 },
      );
    }
    const msg = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    console.error("[widget/today] 실패:", msg, stack);
    return NextResponse.json(
      { error: "오늘의 위젯 데이터를 불러오지 못했습니다.", detail: msg },
      { status: 500 },
    );
  }
}
