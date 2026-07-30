/**
 * 알림 정책 단일 소스 — 순수 함수 모듈 (클라/서버 무관, Firestore·AI 접근 없음).
 *
 * 이 앱의 알림 실행은 플랫폼별로 완전히 갈린다 — Android 는 네이티브 WorkManager
 * (android/.../work/WorkScheduler.kt), iOS 는 UNUserNotificationCenter
 * (ios-templates/plugin/NotificationBridgePlugin.swift). 정책(어떤 알림을 언제, 어떤
 * 조건에서)이 양쪽에 흩어지면 플랫폼 비대칭이 조용히 벌어지므로, **정책·기본값·정규화는
 * 여기 한 곳**에만 두고 플랫폼은 실행만 한다. (lib/homeMode.ts 가 표시 위치를 정하지
 * 않는 것과 같은 분리.)
 *
 * 발송 정책 (알림 피로 방지 — docs/roadmap.md P1 가드레일):
 *   - 하루 최대 2건: 아침 1건 + 조건부 저녁 1건.
 *   - 저녁 리마인더는 오늘 목표를 이미 체크했으면 침묵한다 — 한 일에는 조용히.
 *     (프롬프트/큐 BCT 7.1 은 "아직 안 한 행동" 에만 의미가 있다.)
 *   - 일요일엔 저녁 리마인더가 주간 회고 알림으로 대체된다(추가 발송 아님) —
 *     lib/homeMode.ts 의 WEEKLY_REVIEW_WEEKDAY 와 같은 날, 홈 회고 카드와 정합.
 *
 * 기본값은 기존 Android 동작(08:00/21:00, 전부 켜짐)을 그대로 보존한다 — 레거시
 * 사용자의 알림이 이 변경으로 꺼지거나 시각이 바뀌면 안 된다.
 */
import { WEEKLY_REVIEW_WEEKDAY } from "@/lib/homeMode";
import type { DictKey } from "@/lib/i18n";
import type { NotificationPrefs } from "@/types";

export const DEFAULT_MORNING_HOUR = 8;
export const DEFAULT_EVENING_HOUR = 21;

export const DEFAULT_NOTIFICATION_PREFS: Readonly<NotificationPrefs> = {
  morningEnabled: true,
  morningHour: DEFAULT_MORNING_HOUR,
  eveningEnabled: true,
  eveningHour: DEFAULT_EVENING_HOUR,
  weeklyReviewEnabled: true,
};

/**
 * 설정 UI 가 제시하는 시각 선택지 — lib/homeMode.ts 의 아침(<12)/저녁(>=18) 구간과 정합.
 * 습관은 같은 시각·같은 맥락의 반복으로 형성되므로(Lally et al. 2010) 분 단위 대신
 * 정시만 제공해 선택 부담을 줄인다.
 */
export const MORNING_HOUR_CHOICES: ReadonlyArray<number> = [5, 6, 7, 8, 9, 10, 11];
export const EVENING_HOUR_CHOICES: ReadonlyArray<number> = [18, 19, 20, 21, 22, 23];

function clampHour(raw: unknown, fallback: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(23, Math.max(0, Math.floor(n)));
}

function toBool(raw: unknown, fallback: boolean): boolean {
  return typeof raw === "boolean" ? raw : fallback;
}

/**
 * Firestore 원본(any) → 안전한 NotificationPrefs. 소비처(설정 UI · /api/widget/today ·
 * iOS 브릿지)는 전부 이것 하나만 호출한다 — 소비처에서 재정규화 금지.
 */
export function normalizeNotificationPrefs(raw: unknown): NotificationPrefs {
  const d = DEFAULT_NOTIFICATION_PREFS;
  if (typeof raw !== "object" || raw === null) return { ...d };
  const r = raw as Record<string, unknown>;
  return {
    morningEnabled: toBool(r.morningEnabled, d.morningEnabled),
    morningHour: clampHour(r.morningHour, d.morningHour),
    eveningEnabled: toBool(r.eveningEnabled, d.eveningEnabled),
    eveningHour: clampHour(r.eveningHour, d.eveningHour),
    weeklyReviewEnabled: toBool(r.weeklyReviewEnabled, d.weeklyReviewEnabled),
  };
}

/**
 * 저녁 리마인더를 지금 보내야 하나 — "이미 한 일에는 침묵" 의 단일 정의.
 * 진척도를 모르면(조회 실패·오프라인) 보낸다: 놓친 리마인더가 잘못 간 리마인더보다 비싸다.
 */
export function shouldSendEveningReminder(todayActionsDone: boolean | undefined): boolean {
  return todayActionsDone !== true;
}

/** 이 요일의 저녁 알림이 주간 회고 알림으로 대체되는가 (0=일요일). */
export function isWeeklyReviewDay(weekday: number): boolean {
  return weekday === WEEKLY_REVIEW_WEEKDAY;
}

/** 알림 종류별 로컬라이즈 문구 — iOS 브릿지가 네이티브 예약 시 그대로 싣는다. */
export interface NotificationTexts {
  morning: { title: string; body: string };
  evening: { title: string; body: string };
  weekly: { title: string; body: string };
}

/**
 * 현재 언어의 알림 문구 조립. 호출부(설정/홈)가 useLanguage() 의 t 를 넘긴다 —
 * 이 모듈이 훅에 의존하지 않아야 서버·워커 어디서든 임포트가 안전하다.
 */
export function buildNotificationTexts(t: (key: DictKey) => string): NotificationTexts {
  return {
    morning: { title: t("notify.morning.title"), body: t("notify.morning.body") },
    evening: { title: t("notify.evening.title"), body: t("notify.evening.body") },
    weekly: { title: t("notify.weekly.title"), body: t("notify.weekly.body") },
  };
}

/**
 * 설정 행의 요약 문구 재료 — 켜진 알림 시각만 "08:00 · 21:00" 형태로 나열.
 * 전부 꺼져 있으면 null (호출부가 "꺼짐" 라벨로 대체).
 */
export function summarizeNotificationHours(prefs: NotificationPrefs): string | null {
  const parts: string[] = [];
  if (prefs.morningEnabled) parts.push(`${String(prefs.morningHour).padStart(2, "0")}:00`);
  if (prefs.eveningEnabled || prefs.weeklyReviewEnabled) {
    parts.push(`${String(prefs.eveningHour).padStart(2, "0")}:00`);
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}
