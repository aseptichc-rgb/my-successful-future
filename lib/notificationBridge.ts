/**
 * iOS 로컬 알림 브릿지 (Capacitor 네이티브 플러그인 NotificationBridge 래퍼).
 *
 * 동작: 웹이 알림 설정(NotificationPrefs)과 로컬라이즈 문구를 네이티브로 넘기면,
 * NotificationBridgePlugin.swift 가 UNUserNotificationCenter 에 예약한다.
 * 아침·저녁 모두 앞으로 14일치를 날짜별 개별 예약하고, 앱을 열 때마다 재동기화로 창을 앞으로 민다
 * (14일 이상 미접속이면 알림이 자연 소멸 — 방치된 기기에 영구 알림을 남기지 않는 안전한 실패 방향).
 *   - 아침: 그날의 실제 명언을 싣는다(texts.morningOverrides). 서버가 조립해 준 문구가 없는
 *     날짜는 정적 폴백. 반복 트리거로는 날짜별로 다른 문구를 실을 수 없어 창 방식을 쓴다.
 *   - 저녁/일요일 회고: 오늘 목표를 이미 체크했으면 오늘 저녁 건은 침묵하고
 *     ("한 일에는 침묵", lib/notificationPolicy.shouldSendEveningReminder), 그 자리에만
 *     미완 과업 넛지(texts.eveningPendingTask)를 대신 넣는다 — 총 발송량은 늘지 않는다.
 *
 * 권한: 네이티브가 첫 sync(켜진 항목 존재) 시점에 requestAuthorization 을 띄운다.
 * 호출부는 온보딩이 아니라 가치 체감 시점(설정 저장·홈 방문)에만 sync 를 부른다.
 *
 * 원격 푸시(APNs) 불사용 — 서버 인프라·심사 리스크 없이 로컬 예약만으로 동작한다.
 * 웹/안드로이드/SSR 에서는 전부 안전한 no-op (lib/iosWidget.ts 와 동일 가드 정책).
 */
import { Capacitor, registerPlugin } from "@capacitor/core";
import { WEEKLY_REVIEW_WEEKDAY } from "@/lib/homeMode";
import type { NotificationPrefs } from "@/types";
import type { NotificationCopy, NotificationTexts } from "@/lib/notificationPolicy";

interface NotificationBridgePlugin {
  sync(options: {
    prefs: NotificationPrefs;
    todayGoalDone: boolean;
    allowPrompt: boolean;
    weeklyReviewWeekday: number;
    texts: NotificationTexts;
    /** 날짜(yyyy-MM-dd, 기기 로컬 달력)별 아침 문구 — 그날의 실제 명언. */
    morningOverrides: Record<string, NotificationCopy>;
    /** 오늘 저녁이 침묵할 때 대신 예약할 미완 과업 넛지. null 이면 현행대로 침묵. */
    eveningPendingTask: NotificationCopy | null;
  }): Promise<void>;
  clearAll(): Promise<void>;
}

const NotificationBridge = registerPlugin<NotificationBridgePlugin>("NotificationBridge");

/**
 * iOS 네이티브에서 알림 브릿지를 시도할지 여부. 플랫폼만 보고 게이트한다 —
 * isPluginAvailable 은 원격(server.url) 모드에서 거짓 음성을 내는 회귀가 있어 쓰지 않는다
 * (lib/iosWidget.ts isIosWidgetAvailable 의 동일 정책). 실제 호출 실패는 try-catch 가 흡수.
 */
export function isIosNotificationAvailable(): boolean {
  try {
    return Capacitor.getPlatform() === "ios";
  } catch {
    return false;
  }
}

/**
 * 알림 설정·문구를 네이티브 예약에 동기화한다. 알림은 부가 기능이므로 어떤 실패도
 * throw 하지 않는다(호출부 저장 흐름에 영향 0).
 *
 * @param todayGoalDone 오늘 목표를 모두 체크했는가 — true 면 오늘 저녁 건만 예약 생략.
 *   모르면 false(보낸다): 놓친 리마인더가 잘못 간 리마인더보다 비싸다.
 * @param allowPrompt 권한 프롬프트 허용 여부 — 설정 저장·목표 완주 직후 같은 "가치 체감
 *   시점" 에만 true. false 면 이미 허용된 경우에만 조용히 예약한다(맥락 없는 프롬프트 금지).
 */
export async function syncIosNotifications(input: {
  prefs: NotificationPrefs;
  todayGoalDone: boolean;
  allowPrompt: boolean;
  texts: NotificationTexts;
}): Promise<void> {
  if (!isIosNotificationAvailable()) return;
  try {
    await NotificationBridge.sync({
      prefs: input.prefs,
      todayGoalDone: input.todayGoalDone,
      allowPrompt: input.allowPrompt,
      weeklyReviewWeekday: WEEKLY_REVIEW_WEEKDAY,
      texts: input.texts,
      // 네이티브가 중첩 객체를 파고들지 않도록 최상위로 펼쳐 넘긴다.
      // 구 플러그인 바이너리는 모르는 키를 무시하므로 기존 동작이 그대로 유지된다
      // (iOS 는 server.url 모드라 웹만 먼저 배포되는 구간이 항상 존재한다).
      morningOverrides: input.texts.morningOverrides ?? {},
      eveningPendingTask: input.texts.eveningPendingTask ?? null,
    });
  } catch (err) {
    console.warn("[notificationBridge] iOS 알림 동기화 실패:", err);
  }
}

/** 로그아웃/계정 삭제 시 예약된 알림 전부 제거. 실패해도 무시. */
export async function clearIosNotifications(): Promise<void> {
  if (!isIosNotificationAvailable()) return;
  try {
    await NotificationBridge.clearAll();
  } catch (err) {
    console.warn("[notificationBridge] iOS 알림 제거 실패:", err);
  }
}
