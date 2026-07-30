/**
 * iOS 로컬 알림 브릿지 (Capacitor 네이티브 플러그인 NotificationBridge 래퍼).
 *
 * 동작: 웹이 알림 설정(NotificationPrefs)과 로컬라이즈 문구를 네이티브로 넘기면,
 * NotificationBridgePlugin.swift 가 UNUserNotificationCenter 에 예약한다.
 *   - 아침: 매일 반복 트리거.
 *   - 저녁/일요일 회고: 앞으로 14일치를 날짜별 개별 예약 — 오늘 목표를 이미 체크했으면
 *     오늘 저녁 건만 건너뛴다("한 일에는 침묵", lib/notificationPolicy.shouldSendEveningReminder).
 *     반복 트리거는 하루만 조건부로 끌 수 없어 날짜별 예약을 쓰고, 앱을 열 때마다
 *     재동기화로 창을 앞으로 민다(14일 이상 미접속이면 알림이 자연 소멸 — 방치된 기기에
 *     영구 알림을 남기지 않는 안전한 실패 방향).
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
import type { NotificationTexts } from "@/lib/notificationPolicy";

interface NotificationBridgePlugin {
  sync(options: {
    prefs: NotificationPrefs;
    todayGoalDone: boolean;
    allowPrompt: boolean;
    weeklyReviewWeekday: number;
    texts: NotificationTexts;
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
