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
import { pickPendingTask, type PendingTaskInput } from "@/lib/pendingTasks";
import type { Locale } from "@/lib/i18n/types";
import type { WidgetNotificationContent, WidgetNotificationCopy } from "@/types";

/**
 * 알림 제목의 최대 길이. 잠금화면은 제목을 한 줄로 자르므로, 명언을 제목에 실을 때
 * 시스템이 임의로 자르기 전에 우리가 "…" 로 마감한다(문장 중간에 끊긴 인상 방지).
 */
export const NOTIFY_TITLE_MAX = 40;

function truncate(text: string, max: number): string {
  const trimmed = text.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max).trimEnd()}…` : trimmed;
}

export interface BuildNotificationContentInput {
  locale: Locale;
  uid: string;
  ymd: string;
  /** 오늘의 명언 — 알림 제목에 그대로 싣는다. */
  quote: string;
  author: string;
  /** 오늘의 목표 첫 문구. 있으면 저녁 리마인더 본문을 구체화한다(BCT 2.3 self-monitoring). */
  goalText?: string;
  /** 미완 과업 판정 재료. */
  pending: PendingTaskInput;
  /** 사용자가 과업 넛지를 켜 두었는가. */
  pendingTaskEnabled: boolean;
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
  const quote = input.quote.trim();
  const author = input.author.trim();
  const morning: WidgetNotificationCopy =
    quote.length > 0
      ? {
          title: truncate(quote, NOTIFY_TITLE_MAX),
          body: author
            ? t("notify.morning.quoteBody", { author })
            : t("notify.morning.body"),
          // 제목이 잘렸을 때만 전문을 따로 싣는다(Android BigTextStyle 확장용).
          ...(quote.length > NOTIFY_TITLE_MAX ? { fullText: quote } : {}),
          target: "affirmations",
        }
      : {
          title: t("notify.morning.title"),
          body: t("notify.morning.body"),
          target: "affirmations",
        };

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
  if (input.pendingTaskEnabled && isPendingNudgeDay(input.uid, input.ymd)) {
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

  return { morning, evening, weekly, pendingTask };
}
