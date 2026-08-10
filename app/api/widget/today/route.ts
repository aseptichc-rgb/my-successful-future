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
import { verifyRequestUser, canUseAiFeatures, AuthError } from "@/lib/authServer";
import { enforceQuota, QuotaExceededError } from "@/lib/quota";
import {
  KST_OFFSET_MS,
  ensureMotivation,
  isValidYmd,
  todayKst,
} from "@/lib/dailyMotivation";
import { ensureFutureVision } from "@/lib/futureVision";
import { pickTodayPlan, pickTodayAffirmationIndex } from "@/lib/planRotation";
import { normalizeNotificationPrefs } from "@/lib/notificationPolicy";
import type {
  FutureVision,
  NotificationPrefs,
  WidgetExecutionPlan,
  WidgetFutureVision,
  WidgetSlot,
  WidgetTodayProgress,
  WidgetTodayResponse,
} from "@/types";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const REQUIRED_WINS = 3;
// 위젯에 실어 보낼 다짐 최대 개수 — lib/firebase.ts MAX_SUCCESS_AFFIRMATIONS 와 동기화.
// (저장 시점에 이미 컷되지만, 옛 문서 방어를 위해 응답에서도 한 번 더 제한)
const MAX_WIDGET_AFFIRMATIONS = 10;
// "그 꿈을 사는 하루" 위젯 티저로 실을 첫 장면 발췌 길이. 위젯 폭에서 2줄 안에 들어오도록.
const WIDGET_VISION_TEASER_MAX = 100;

/** 위젯 1줄 카운트("n / N")로 줄여 보여줄 "오늘의 행동 / 이번 달 목표" 진척 카운트 묶음. */
interface TodayProgressResult {
  progress: WidgetTodayProgress;
  goalsAchievedCount: number;
  goalsTotalCount: number;
}

/**
 * 미래 비전 전체에서 위젯용 티저(제목 + 한 토막)를 만든다.
 * 발췌 본문은 "접힌 카드용 호기심 한 줄"인 hook 을 우선 쓰고, 없으면 첫 장면 본문으로 폴백한다
 * (hook 은 결말을 감춰 더 보고 싶게 만드는 용도라 위젯 티저에 가장 적합).
 * 제목 또는 발췌가 모두 비면 null — 위젯은 해당 섹션을 자연 생략한다.
 */
function buildVisionTeaser(vision: FutureVision): WidgetFutureVision | null {
  const title = typeof vision.title === "string" ? vision.title.trim() : "";
  const hook = typeof vision.hook === "string" ? vision.hook.trim() : "";
  const firstScene = Array.isArray(vision.scenes) ? vision.scenes[0] : undefined;
  const sceneText = typeof firstScene?.text === "string" ? firstScene.text.trim() : "";
  const source = hook || sceneText;
  if (!title || !source) return null;
  const teaser =
    source.length > WIDGET_VISION_TEASER_MAX
      ? `${source.slice(0, WIDGET_VISION_TEASER_MAX).trimEnd()}…`
      : source;
  return { title, teaser };
}

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
): Promise<TodayProgressResult> {
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
  // 목표별 달성 카운트("이번 달 목표 n / N") — 위젯이 목록 대신 한 줄 카운트로 줄여 쓴다.
  const goalsAchievedCount = goals.filter((g) => achievedSet.has(g)).length;
  const goalsTotalCount = goals.length;
  const actions = goalsTotalCount > 0 && goalsAchievedCount === goalsTotalCount;

  const winsFilled = entry.wins.filter((w) => w.length > 0).length;
  const wins = winsFilled >= REQUIRED_WINS;

  return {
    progress: { affirmation, actions, wins },
    goalsAchievedCount,
    goalsTotalCount,
  };
}

/**
 * "오늘의 if-then" 실행설계 1개 — 홈 DailyPlanCard 와 동일한 순수 회전(pickTodayPlan)을
 * 써 위젯·홈이 항상 같은 플랜을 본다. 정렬(createdAt asc)도 클라 구독과 동일해야
 * 회전 인덱스가 일치한다. 조회/데이터 실패 시 undefined — 위젯은 섹션 자연 생략.
 */
async function fetchTodayExecutionPlan(
  uid: string,
  ymd: string,
): Promise<WidgetExecutionPlan | undefined> {
  try {
    const snap = await getAdminDb()
      .collection(`users/${uid}/executionPlans`)
      .orderBy("createdAt", "asc")
      .get();
    const plans = snap.docs.map((d) => {
      const data = d.data() ?? {};
      return {
        goal: typeof data.goal === "string" ? data.goal.trim() : "",
        ifText: typeof data.ifText === "string" ? data.ifText.trim() : "",
        thenText: typeof data.thenText === "string" ? data.thenText.trim() : "",
        active: data.active !== false,
      };
    });
    const picked = pickTodayPlan(plans, uid, ymd);
    if (!picked || !picked.ifText || !picked.thenText) return undefined;
    return { goal: picked.goal, ifText: picked.ifText, thenText: picked.thenText };
  } catch (err) {
    console.error("[widget/today] 실행설계 조회 실패(생략):", err);
    return undefined;
  }
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
    // 위젯은 무료 티어의 핵심 습관 표면이라 막지 않는다 — 미결제 사용자는 큐레이션 카드로
    // 다운그레이드해서 계속 채워준다(빈 위젯은 곧 삭제로 이어진다). 정책표: lib/constants/quota.ts.
    const me = await verifyRequestUser(request);
    const aiAllowed = canUseAiFeatures(me);

    const url = new URL(request.url);
    const ymdParam = url.searchParams.get("ymd");
    const ymd = ymdParam && isValidYmd(ymdParam) ? ymdParam : todayKst();

    // 일별 호출 한도(KST 자정 기준)는 "카드 생성"(=Gemini 호출, 비용 발생) 에만 건다.
    // 이미 만들어진 오늘 카드를 위젯이 다시 읽는 건 값싼 Firestore read 이므로 카운트하지 않는다.
    // 과거엔 단순 조회까지 widgetRefresh 한도(48)에 합산돼, 위젯이 하루 48번 폴링하면 그 뒤로
    // 종일 429 가 떨어져 다짐 본문/진척도가 위젯에서 사라지는 회귀가 있었다.
    //
    // 순서가 중요: 반드시 enforceQuota → ensureMotivation 이어야 한다.
    // (생성 후 쿼터 체크로 바꾸면 쿼터 초과 시에도 Gemini 비용이 발생하고, 사용자는
    //  "카드는 생성됐지만 429" 라는 모순된 응답을 받는다.)
    const motivationRef = getAdminDb().doc(`users/${me.uid}/dailyMotivations/${ymd}`);
    const motivationExists = (await motivationRef.get()).exists;
    if (!motivationExists) {
      // 새 카드 생성만 한도로 게이팅 — 초과 시 429.
      await enforceQuota(me.uid, "widgetRefresh");
    }

    // 1) 오늘의 개인화 카드 보장 (없으면 생성)
    const { motivation } = await ensureMotivation({
      uid: me.uid,
      ymd,
      curatedOnly: !aiAllowed,
    });

    // 2) 진척도 수집 + streak 동시 추출. home 의 "오늘 행동 체크" 와 일치하도록
    //    user.goals 를 실시간으로 읽고, 같은 스냅샷에서 affirmationStreak.count 도 함께 뽑아
    //    추가 라운드트립 없이 위젯 응답에 실어 보낸다.
    let userGoals: string[] | undefined;
    let streakCount = 0;
    let affirmations: string[] = [];
    // 알림 설정 — Android 가 이 응답을 캐시에 쓸 때 로컬 스케줄로 동기화한다(별도 API 없음).
    // 조회 실패 시에도 기본값을 실어 보내 클라이언트가 항상 완전한 정책을 받게 한다.
    let notificationPrefs: NotificationPrefs = normalizeNotificationPrefs(undefined);
    /**
     * 오늘 새길 다짐 인덱스 — 앱 체크인이 요구하는 그 한 줄을 위젯도 같이 가리키게 한다.
     * ⚠️ 회전은 **잘라내기 전 전체 목록 길이**로 계산해야 서버 체크인 판정과 일치한다.
     *    잘린 목록에 그 줄이 없으면 필드를 생략한다(잘못된 줄을 강조하지 않는다).
     */
    let affirmationFocusIndex: number | undefined;
    try {
      const userSnap = await getAdminDb().collection("users").doc(me.uid).get();
      const data = userSnap.data();
      if (data && Array.isArray(data.goals)) {
        userGoals = data.goals as string[];
      }
      notificationPrefs = normalizeNotificationPrefs(data?.notificationPrefs);
      const rawStreak = (data?.affirmationStreak as { count?: unknown } | undefined)?.count;
      const n = Number(rawStreak ?? 0);
      streakCount = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
      // "성공한 나에게 한 발 더" 다짐 본문 — 위젯이 매일 결심을 다잡도록 그대로 노출.
      if (data && Array.isArray(data.successAffirmations)) {
        const all = (data.successAffirmations as unknown[])
          .map((a) => (typeof a === "string" ? a.trim() : ""))
          .filter((a) => a.length > 0);
        affirmations = all.slice(0, MAX_WIDGET_AFFIRMATIONS);
        if (all.length > 0) {
          const focus = pickTodayAffirmationIndex(me.uid, ymd, all.length);
          if (focus < affirmations.length) affirmationFocusIndex = focus;
        }
      }
    } catch (err) {
      console.error("[widget/today] user 문서 조회 실패:", err);
    }
    // 진척도와 실행설계는 서로 독립 — 병렬 조회로 응답 시간을 아낀다.
    const [progressResult, executionPlan] = await Promise.all([
      fetchTodayProgress(me.uid, ymd, userGoals),
      fetchTodayExecutionPlan(me.uid, ymd),
    ]);

    // 2-b) "그 꿈을 사는 하루" 비전 보장 + 위젯 티저 조립.
    //   동기부여 카드(ensureMotivation)와 동일하게 force=false 로, 오늘 비전이 없으면 생성하고
    //   이미 있으면 캐시를 그대로 읽는다(하루 1회 Gemini, 이후 0). force 경로가 아니라
    //   enforceQuota 를 타지 않으므로 429 위험이 없다. 어떤 실패든 티저를 생략해 위젯 본문은
    //   영향받지 않는다(비전은 보조 콘텐츠 — 없을 땐 해당 섹션만 자연 생략).
    //   무료 티어는 이 블록을 통째로 건너뛴다 — 비전은 Pro 전용이라 위젯에서 몰래 생성하면
    //   막아둔 기능의 LLM 비용이 그대로 새어나간다. 티저만 빠지고 위젯 본문은 정상 동작한다.
    let futureVision: WidgetFutureVision | undefined;
    if (aiAllowed) {
      try {
        const { vision } = await ensureFutureVision({ uid: me.uid, ymd });
        futureVision = buildVisionTeaser(vision) ?? undefined;
      } catch (err) {
        console.error("[widget/today] 미래 비전 티저 조립 실패(생략):", err);
      }
    }

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
      todayProgress: progressResult.progress,
      streakCount,
      affirmations,
      ...(affirmationFocusIndex !== undefined ? { affirmationFocusIndex } : {}),
      ...(futureVision ? { futureVision } : {}),
      goalsAchievedCount: progressResult.goalsAchievedCount,
      goalsTotalCount: progressResult.goalsTotalCount,
      // 응답 호환성: 플랜 미설정/조회 실패 시 필드 생략 — 옛 클라이언트는 무시, 신 클라이언트는 섹션 생략.
      ...(executionPlan ? { executionPlan } : {}),
      notificationPrefs,
    };

    // 캐시 정책: `_t` 쿼리(클라 측 cache-buster) 가 실려 있거나 Cache-Control: no-cache
    // 헤더가 있으면 절대 캐싱하지 않는다 — 사용자가 막 저장한 직후의 호출이 stale 응답을
    // 받는 회귀를 차단. 그 외의 정주기 Worker 호출은 짧은 private 캐시(60초) 유지.
    const hasCacheBust = url.searchParams.has("_t");
    const reqCacheControl = (request.headers.get("cache-control") || "").toLowerCase();
    const wantsFresh = hasCacheBust || reqCacheControl.includes("no-cache") || reqCacheControl.includes("no-store");
    const cacheControl = wantsFresh
      ? "private, no-store, no-cache, must-revalidate"
      : "private, max-age=60";

    return NextResponse.json(body, {
      headers: {
        "Cache-Control": cacheControl,
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
    // 내부 예외 메시지(Firestore 경로·GCP 오류 등)를 클라이언트에 노출하지 않는다.
    return NextResponse.json(
      { error: "오늘의 위젯 데이터를 불러오지 못했습니다." },
      { status: 500 },
    );
  }
}
