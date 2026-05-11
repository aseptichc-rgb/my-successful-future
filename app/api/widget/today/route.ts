/**
 * GET /api/widget/today
 *
 * 안드로이드 위젯/메인 앱이 한 번 호출로 받아가는 "오늘의 슬롯" 응답.
 *
 * 슬롯 구성 (총 8개, KST 자정 기준 3시간 단위 = 24h):
 *   slot[0]              = 오늘의 동기부여 카드 (개인화 한 마디 / dailyMotivation)
 *   slot[1] ~ slot[7]    = famousQuotes 컬렉션에서 결정론적으로 7개 선택
 *
 * 결정론: 같은 uid+ymd 라면 항상 같은 7개가 같은 순서로 뽑힘 → 위젯이 시간별로
 *         같은 콘텐츠를 보여줌. 다음 날엔 다른 7개가 뽑힘.
 *
 * currentSlotIndex: 서버가 현재 KST 시간을 보고 0~7 중 어느 슬롯이 "지금"인지 알려줌.
 * 위젯은 그 인덱스만 보여주면 됨.
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
  hash32,
  isValidYmd,
  pickGradient,
  todayKst,
} from "@/lib/dailyMotivation";
import type {
  FamousQuote,
  FamousQuoteLang,
  WidgetSlot,
  WidgetSlotFamous,
  WidgetSlotMotivation,
  WidgetTodayProgress,
  WidgetTodayResponse,
} from "@/types";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const SLOT_HOURS = 3;
const TOTAL_SLOTS = 24 / SLOT_HOURS; // 8
const FAMOUS_SLOT_COUNT = TOTAL_SLOTS - 1; // 7
const DEFAULT_LANG: FamousQuoteLang = "ko";
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

/** KST 현재 시각으로 0~TOTAL_SLOTS-1 슬롯 인덱스 계산 */
function currentSlotKst(now: Date): number {
  const kst = new Date(now.getTime() + KST_OFFSET_MS);
  // toISOString 은 UTC 기준이지만, 우리가 더한 offset 덕에 시 부분이 KST 시간이 됨
  const hour = kst.getUTCHours();
  return Math.floor(hour / SLOT_HOURS);
}

/** 슬롯 시작 시각 (KST) → ISO timestamp. 다음 갱신 시각 계산용. */
function nextRefreshIso(now: Date): string {
  const kst = new Date(now.getTime() + KST_OFFSET_MS);
  const hour = kst.getUTCHours();
  const nextSlotHour = (Math.floor(hour / SLOT_HOURS) + 1) * SLOT_HOURS; // 다음 슬롯 시각
  // KST 자정 + nextSlotHour
  const kstMidnight = Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate());
  const nextKstEpoch = kstMidnight + nextSlotHour * 3600 * 1000;
  // KST → UTC 환산
  return new Date(nextKstEpoch - KST_OFFSET_MS).toISOString();
}

/**
 * famousQuotes 에서 active=true, language=lang 만 가져와 결정론적으로 N 개 추출.
 * 큐레이션 풀이 N 보다 작으면 가능한 만큼만 반환.
 */
async function pickFamousQuotes(
  uid: string,
  ymd: string,
  lang: FamousQuoteLang,
  count: number,
): Promise<FamousQuote[]> {
  const snap = await getAdminDb()
    .collection("famousQuotes")
    .where("active", "==", true)
    .where("language", "==", lang)
    .get();

  const all: FamousQuote[] = snap.docs
    .map((d) => d.data() as FamousQuote)
    .filter((q): q is FamousQuote => Boolean(q && q.id && q.text));

  if (all.length === 0) return [];

  // ID 기준 정렬로 결정론 보장 (Firestore 순서 비결정성 회피)
  all.sort((a, b) => a.id.localeCompare(b.id));

  const startSeed = hash32(`${uid}:${ymd}:famous`);
  const start = startSeed % all.length;
  // 같은 day 내에서도 슬롯마다 다른 인용이 보이도록 stride 적용
  const strideSeed = hash32(`${uid}:${ymd}:stride`);
  // gcd(stride, all.length) == 1 이어야 중복 없이 회전. 안전하게 1 로 폴백.
  let stride = (strideSeed % Math.max(all.length - 1, 1)) + 1;
  if (gcd(stride, all.length) !== 1) stride = 1;

  const picked: FamousQuote[] = [];
  const seen = new Set<number>();
  let idx = start;
  while (picked.length < Math.min(count, all.length)) {
    if (!seen.has(idx)) {
      picked.push(all[idx]);
      seen.add(idx);
    }
    idx = (idx + stride) % all.length;
  }
  return picked;
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
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
    const langParam = url.searchParams.get("lang");
    const lang: FamousQuoteLang = langParam === "en" ? "en" : DEFAULT_LANG;

    // 1) 오늘의 개인화 카드 보장 (없으면 생성)
    const { motivation } = await ensureMotivation({ uid: me.uid, ymd });

    // 2) famousQuotes 풀에서 7개 결정론적 추출
    const famous = await pickFamousQuotes(me.uid, ymd, lang, FAMOUS_SLOT_COUNT);

    // 2.5) 위젯 하단 진척도(다짐/행동/잘한 일) 수집.
    //      home 의 "오늘 행동 체크" 와 일치하도록 user.goals 를 실시간으로 읽는다.
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

    // 3) 슬롯 조립
    const motivationSlot: WidgetSlotMotivation = {
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

    const famousSlots: WidgetSlotFamous[] = famous.map((q, i) => ({
      kind: "famous",
      text: q.text,
      author: q.author,
      category: q.category,
      gradient: pickGradient(`${me.uid}:${ymd}:famous:${i}`),
    }));

    const slots: WidgetSlot[] = [motivationSlot, ...famousSlots];

    const now = new Date();
    const rawCurrent = currentSlotKst(now);
    // 슬롯이 부족(예: famous 풀이 비어 1개뿐)할 때 인덱스 클램프
    const currentSlotIndex = slots.length === 0 ? 0 : rawCurrent % slots.length;

    const body: WidgetTodayResponse = {
      generatedAt: now.toISOString(),
      ymd,
      currentSlotIndex,
      slots,
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
