/**
 * 알림 문구 조립 — 사용자 언어로 완성된 title/body 를 만들어 플랫폼에 내려보낸다.
 *
 * 왜 서버가 조립하나:
 *   - Android 는 알림 문구가 res/values/strings.xml 한국어 하드코딩이라(values-en 등 없음)
 *     스스로 로컬라이즈하지 못한다. 서버가 조립하면 4개 언어가 공짜로 따라온다.
 *   - iOS 는 UNUserNotificationCenter 예약 시점에 문구가 이미 확정돼 있어야 한다.
 *   - 무엇보다, 이 문구에는 **그날의 명언**과 **미완 과업 진행도** 처럼 서버만 아는 값이 들어간다.
 *
 * 정책(언제 보내나)은 lib/notificationPolicy.ts 가, 무엇이 밀렸나는 lib/pendingTasks.ts 가
 * 소유한다. 이 모듈은 그 판정 결과를 **문자열로 옮기는 일만** 한다.
 */
import { getServerT } from "@/lib/i18n/translate";
import { isPendingNudgeDay } from "@/lib/notificationPolicy";
import { truncateText } from "@/lib/truncateText";
import { pickPendingTask, type PendingTaskInput } from "@/lib/pendingTasks";
import type { Locale } from "@/lib/i18n/types";
import type {
  WidgetNotificationContent,
  WidgetNotificationCopy,
  WidgetUpcomingQuote,
} from "@/types";

/**
 * 알림 제목의 최대 길이. 잠금화면은 제목을 한 줄로 자르므로, 명언을 제목에 실을 때
 * 시스템이 임의로 자르기 전에 우리가 "…" 로 마감한다(문장 중간에 끊긴 인상 방지).
 */
const NOTIFY_TITLE_MAX = 40;

export interface BuildNotificationContentInput {
  locale: Locale;
  uid: string;
  ymd: string;
  /** 오늘의 명언 — 알림 제목에 그대로 싣는다. */
  quote: string;
  author: string;
  /** 오늘의 목표 첫 문구. 있으면 저녁 리마인더 본문을 구체화한다(BCT 2.3 self-monitoring). */
  goalText?: string;
  /**
   * 미완 과업 판정 재료. **재료를 못 모았으면 생략한다** — 빈 값을 넘기면
   * "목표가 비어 있어요" 를 목표가 있는 사용자에게 보내게 된다. 생략 시 넛지를 만들지 않는다.
   */
  pending?: PendingTaskInput;
  /** 사용자가 과업 넛지를 켜 두었는가. */
  pendingTaskEnabled: boolean;
  /**
   * 다음 날들의 명언 미리보기(lib/dailyMotivation.buildUpcomingPreviews).
   * 있으면 날짜별 아침 문구(morningUpcoming)로 조립돼, 앱을 안 열어도 아침 알림에
   * "그날의 명언" 이 실린다. 생략 시 기존 동작(오늘 문구만) 그대로.
   */
  upcoming?: ReadonlyArray<WidgetUpcomingQuote>;
}

/**
 * 오늘 발송 후보 알림 3종 + 침묵 슬롯 대체분의 완성 문구를 만든다.
 *
 * 순수 함수 — Firestore/네트워크 접근이 없다(호출부가 재료를 다 모아서 넘긴다).
 * 어떤 입력이 비어 있어도 던지지 않는다: 명언이 없으면 정적 아침 문구로, 목표가 없으면
 * 일반 저녁 문구로 자연 폴백한다. 알림은 부가 기능이라 조립 실패가 위젯 본문을 깨면 안 된다.
 */
export function buildNotificationContent(
  input: BuildNotificationContentInput,
): WidgetNotificationContent {
  const t = getServerT(input.locale);

  // ── 아침: 오늘의 명언 실문구. 알림만 봐도 오늘 한 마디를 읽게 한다.
  const morning: WidgetNotificationCopy =
    buildMorningQuoteCopy(input.quote, input.author, t) ?? {
      title: t("notify.morning.title"),
      body: t("notify.morning.body"),
      target: "affirmations",
    };

  // ── 아침(미래분): upcoming 미리보기를 날짜별 아침 문구로 미리 조립한다.
  //    iOS 는 사전 예약 창(D+1~)에 그대로 싣고, Android 는 아침에 캐시가 어제 것일 때
  //    (오프라인) 오늘 자 문구로 폴백한다 — 어느 쪽이든 "그날의 명언" 이 보장된다.
  let morningUpcoming: Record<string, WidgetNotificationCopy> | undefined;
  if (input.upcoming && input.upcoming.length > 0) {
    const entries: Record<string, WidgetNotificationCopy> = {};
    for (const preview of input.upcoming) {
      const copy = buildMorningQuoteCopy(preview.text, preview.author, t);
      if (copy) entries[preview.ymd] = copy;
    }
    if (Object.keys(entries).length > 0) morningUpcoming = entries;
  }

  // ── 저녁: 오늘의 목표를 본문에 실어 "무엇을 하면 되는지"를 알림만 봐도 알게 한다.
  const goalText = input.goalText?.trim();
  const evening: WidgetNotificationCopy = {
    title: t("notify.evening.title"),
    body: goalText ? t("notify.evening.bodyGoal", { goal: goalText }) : t("notify.evening.body"),
    target: "wins",
  };

  const weekly: WidgetNotificationCopy = {
    title: t("notify.weekly.title"),
    body: t("notify.weekly.body"),
    target: "home",
  };

  // ── 침묵 슬롯 대체분: 오늘이 넛지 허용일이고 밀린 과업이 있을 때만.
  //    실제로 보낼지(오늘 할 일을 다 했는지)는 발송 시점에 플랫폼이 decideEveningSlot 으로 판정한다.
  let pendingTask: WidgetNotificationCopy | null = null;
  if (input.pending && input.pendingTaskEnabled && isPendingNudgeDay(input.uid, input.ymd)) {
    const picked = pickPendingTask(input.pending, input.uid, input.ymd);
    if (picked) {
      pendingTask = {
        title: t("notify.pending.title"),
        // 본문에는 진행도 숫자만 — 사용자가 쓴 원문은 잠금화면에 노출하지 않는다.
        body: t(picked.bodyKey, { filled: picked.filled, total: picked.total }),
        target: picked.target,
      };
    }
  }

  return { morning, evening, weekly, pendingTask, ...(morningUpcoming ? { morningUpcoming } : {}) };
}

/**
 * 명언 한 건을 아침 알림 카피로 조립한다. 오늘 문구와 upcoming 미래 문구가 같은 규칙을
 * 공유해야 "오늘은 잘리는데 내일은 안 잘리는" 식의 어긋남이 없다(DRY).
 * 명언이 비어 있으면 null — 호출부가 정적 폴백으로 대체한다.
 */
function buildMorningQuoteCopy(
  rawQuote: string,
  rawAuthor: string,
  t: ReturnType<typeof getServerT>,
): WidgetNotificationCopy | null {
  const quote = rawQuote.trim();
  if (quote.length === 0) return null;
  const author = rawAuthor.trim();
  const title = truncateText(quote, NOTIFY_TITLE_MAX);
  return {
    title,
    body: author ? t("notify.morning.quoteBody", { author }) : t("notify.morning.body"),
    // 제목이 실제로 잘렸을 때만 전문을 따로 싣는다(Android BigTextStyle 확장용).
    // 길이 비교가 아니라 결과 비교여야 한다 — 이모지가 섞이면 UTF-16 길이와
    // 코드 포인트 수가 달라 "안 잘렸는데 전문을 싣는" 경우가 생긴다.
    ...(title !== quote ? { fullText: quote } : {}),
    target: "affirmations",
  };
}
