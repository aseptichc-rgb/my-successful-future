"use client";

/**
 * 클라이언트 이벤트 전송 — /api/events 로 화이트리스트 이름 1건을 보낸다.
 *
 * 규약:
 *  - fire-and-forget. 절대 throw 하지 않고 await 를 요구하지 않는다. 계측이 UI 를 늦추거나
 *    깨뜨리면 안 된다(실패는 console.warn 한 줄).
 *  - 서버가 판정할 수 있는 사실(결제 완료·체험 시작·402)은 여기서 보내지 않는다 — 서버
 *    라우트가 lib/events.logEvent 로 직접 남긴다. 클라는 "화면에 그렸다/눌렀다" 만 보고한다.
 *  - app_open 은 기기별 KST 하루 1회로 중복 제거한다(localStorage). 여러 기기는 각자 1회를
 *    보내지만 집계(lib/retention)가 uid+day 로 다시 묶으므로 리텐션엔 영향 없다.
 */
import { authedFetch } from "@/lib/authedFetch";
import { isAndroidApp } from "@/lib/widgetBridge";
import { isIosNative } from "@/lib/nativeAuth";
import type { EventName, EventPlatform } from "@/lib/constants/events";
import type { EventProps } from "@/lib/events";

const APP_OPEN_KEY = "anima.track.appOpenYmd";

/** 현재 실행 환경 — 서버 렌더에서는 항상 web. */
export function detectEventPlatform(): EventPlatform {
  if (typeof window === "undefined") return "web";
  try {
    if (isIosNative()) return "ios";
    if (isAndroidApp()) return "android";
  } catch {
    /* 브릿지 미주입 — 웹으로 간주 */
  }
  return "web";
}

export function track(name: EventName, props?: EventProps): void {
  if (typeof window === "undefined") return;
  void (async () => {
    try {
      const res = await authedFetch("/api/events", {
        method: "POST",
        body: JSON.stringify({ name, props: props ?? {}, platform: detectEventPlatform() }),
        keepalive: true,
      });
      if (!res.ok) console.warn(`[track] ${name} 거절: HTTP ${res.status}`);
    } catch (err) {
      console.warn(`[track] ${name} 전송 실패:`, err instanceof Error ? err.message : String(err));
    }
  })();
}

/**
 * app_open 을 오늘(KST) 처음이면 한 번만 보낸다. 반환값은 "보냈는가".
 * localStorage 를 못 쓰는 환경(프라이빗 모드 등)에서는 세션마다 보낸다 — 과소보다 과다가 낫고,
 * 집계는 uid+day 로 묶으므로 리텐션 수치는 흔들리지 않는다.
 */
export function trackAppOpenOnce(todayYmd: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.localStorage.getItem(APP_OPEN_KEY) === todayYmd) return false;
    window.localStorage.setItem(APP_OPEN_KEY, todayYmd);
  } catch {
    /* localStorage 불가 — 그냥 보낸다 */
  }
  track("app_open");
  return true;
}
