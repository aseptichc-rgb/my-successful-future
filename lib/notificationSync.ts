/**
 * iOS 로컬 알림에 실을 "실제 콘텐츠" 확보 — 서버가 조립한 알림 문구를 받아온다.
 *
 * 왜 필요한가: iOS 는 UNUserNotificationCenter 에 **미리** 예약하는 구조라 예약 시점에 문구가
 * 확정돼 있어야 한다. Android 는 Worker 가 발송 직전에 서버를 부르므로 이 경로가 필요 없다.
 *
 * 그래서 아침 알림에 실을 명언은 "오늘 것"만으로는 부족하다 — 내일 아침 알림도 지금 예약되기
 * 때문이다. 앱을 여는 김에 **내일 카드를 미리 확정**해 그 문구까지 실어 둔다:
 *   - Gemini 총 호출 수는 중립이다. 어차피 내일 만들 카드를 하루 앞당겨 만들 뿐이고,
 *     ensureMotivation 은 이미 있으면 캐시를 읽는다.
 *   - 저녁(PREFETCH_MIN_HOUR) 이후에만 미리 만든다. 아침에 만들면 카드에 박히는
 *     goalsSnapshot 이 24시간 낡은 채로 굳는다 — 저녁이면 그날의 목표 편집이 대체로 끝나 있다.
 *   - 실패하면 그냥 건너뛴다. 정적 폴백 문구로 알림은 계속 나간다.
 *
 * D+2 이후는 명언이 아직 존재하지 않아 정적 폴백이다. 매일 앱을 여는 사용자는 예약 창이
 * 계속 앞으로 밀리므로 사실상 항상 실제 명언을 받는다.
 */
import { authedFetch } from "@/lib/authedFetch";
import { addKstDays, todayKstYmd } from "@/lib/kstDate";
import type { WidgetNotificationCopy, WidgetTodayResponse } from "@/types";

/** 내일 카드를 미리 확정하기 시작하는 기기 로컬 시각. */
export const PREFETCH_MIN_HOUR = 18;

interface NotificationCopy {
  title: string;
  body: string;
}

export interface NotificationServerContent {
  /** 기기 로컬 달력 날짜(yyyy-MM-dd) → 그날 아침 문구. 네이티브가 같은 키로 매칭한다. */
  morningOverrides: Record<string, NotificationCopy>;
  /** 오늘 저녁이 침묵할 때 대신 예약할 미완 과업 넛지. */
  eveningPendingTask: NotificationCopy | null;
}

/** 기기 **로컬** 달력 기준 yyyy-MM-dd. 알림이 로컬 시각에 울리므로 KST ymd 를 쓰면 안 된다. */
function localYmd(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function toCopy(raw: WidgetNotificationCopy | undefined | null): NotificationCopy | null {
  const title = raw?.title?.trim();
  const body = raw?.body?.trim();
  return title && body ? { title, body } : null;
}

async function fetchWidgetToday(ymd?: string): Promise<WidgetTodayResponse | null> {
  try {
    const res = await authedFetch(ymd ? `/api/widget/today?ymd=${ymd}` : "/api/widget/today");
    if (!res.ok) return null;
    return (await res.json()) as WidgetTodayResponse;
  } catch {
    // 알림은 부가 기능 — 어떤 실패도 호출부로 던지지 않는다.
    return null;
  }
}

/**
 * 오늘(+조건부로 내일)의 알림 문구를 모아 온다.
 * 어떤 실패에도 throw 하지 않는다 — 못 받으면 정적 폴백 문구가 쓰인다.
 */
export async function fetchNotificationContent(): Promise<NotificationServerContent> {
  const empty: NotificationServerContent = { morningOverrides: {}, eveningPendingTask: null };

  const today = await fetchWidgetToday();
  if (!today) return empty;

  const morningOverrides: Record<string, NotificationCopy> = {};
  const todayMorning = toCopy(today.notificationContent?.morning);
  if (todayMorning) morningOverrides[localYmd(0)] = todayMorning;

  // 내일 카드는 저녁 이후에만 미리 확정한다(위 주석의 goalsSnapshot 신선도 이유).
  if (new Date().getHours() >= PREFETCH_MIN_HOUR) {
    // 서버의 하루 경계는 KST — 응답의 ymd 를 기준으로 다음 날을 계산해 기기 시계 오차를 타지 않는다.
    const serverToday = today.ymd || todayKstYmd();
    const tomorrow = await fetchWidgetToday(addKstDays(serverToday, 1));
    const tomorrowMorning = toCopy(tomorrow?.notificationContent?.morning);
    if (tomorrowMorning) morningOverrides[localYmd(1)] = tomorrowMorning;
  }

  return {
    morningOverrides,
    eveningPendingTask: toCopy(today.notificationContent?.pendingTask),
  };
}
