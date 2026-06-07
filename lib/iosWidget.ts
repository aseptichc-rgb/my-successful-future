/**
 * iOS 홈/잠금화면 위젯 브릿지 (Capacitor 네이티브 플러그인 WidgetBridge 래퍼).
 *
 * 동작: 메인 앱(WKWebView)이 /api/widget/today 응답을 받으면 그 JSON 을 네이티브로 넘겨
 * App Group 공유 저장소에 쓰고 WidgetKit 타임라인을 리로드한다. 위젯 익스텐션은 이 캐시만
 * 읽어 렌더링한다(위젯 안에서는 Firebase 토큰/네트워크를 다루지 않음 — Android QuoteCache 와 동일).
 *
 * 웹/안드로이드/SSR 에서는 플러그인이 없으므로 모든 함수가 안전하게 no-op 으로 떨어진다.
 */
import { Capacitor, registerPlugin } from "@capacitor/core";
import { authedFetch } from "@/lib/authedFetch";

interface WidgetBridgePlugin {
  setWidgetData(options: { json: string }): Promise<void>;
  clearWidgetData(): Promise<void>;
}

const WidgetBridge = registerPlugin<WidgetBridgePlugin>("WidgetBridge");

/** iOS 네이티브에서 WidgetBridge 플러그인을 쓸 수 있는지. SSR/웹/안드로이드에선 false. */
export function isIosWidgetAvailable(): boolean {
  try {
    return (
      Capacitor.getPlatform() === "ios" &&
      Capacitor.isPluginAvailable("WidgetBridge")
    );
  } catch {
    return false;
  }
}

/**
 * 위젯 데이터(보통 WidgetTodayResponse)를 네이티브 공유 저장소에 밀어 넣고 위젯을 갱신한다.
 * 직렬화/브릿지 실패는 위젯의 부가 기능이므로 throw 하지 않고 경고만 남긴다.
 */
export async function pushWidgetData(data: unknown): Promise<void> {
  if (!isIosWidgetAvailable()) return;
  try {
    await WidgetBridge.setWidgetData({ json: JSON.stringify(data) });
  } catch (err) {
    console.warn("[iosWidget] 위젯 데이터 전달 실패:", err);
  }
}

/**
 * /api/widget/today 를 인증 호출해 최신 "오늘 카드"를 받아 위젯에 푸시한다.
 * iOS 네이티브가 아니면 즉시 no-op. 위젯은 부가 기능이므로 어떤 실패도 삼킨다(throw 없음).
 *
 * 호출 시점: 홈 마운트 시 1회 + 다짐/행동/잘한 일 저장 직후(진척도 변경 반영).
 * `_t` 쿼리로 CDN/캐시 우회 — 사용자가 막 저장한 직후에도 origin 최신값을 받는다.
 * (단순 조회는 서버 widgetRefresh 쿼터에 합산되지 않으므로 연타 위험 낮음.)
 */
export async function refreshIosWidget(): Promise<void> {
  if (!isIosWidgetAvailable()) return;
  try {
    const res = await authedFetch(`/api/widget/today?_t=${Date.now()}`, {
      cache: "no-store",
      headers: { "Cache-Control": "no-cache" },
    });
    if (!res.ok) {
      // 401/402/429 등은 위젯 갱신 실패로만 처리 — 홈 UI 흐름엔 영향 주지 않는다.
      console.warn("[iosWidget] /api/widget/today 응답 비정상:", res.status);
      return;
    }
    const data = await res.json();
    await pushWidgetData(data);
  } catch (err) {
    console.warn("[iosWidget] 위젯 새로고침 실패:", err);
  }
}

/** 로그아웃 시 위젯 캐시를 비운다. 실패해도 무시. */
export async function clearIosWidget(): Promise<void> {
  if (!isIosWidgetAvailable()) return;
  try {
    await WidgetBridge.clearWidgetData();
  } catch (err) {
    console.warn("[iosWidget] 위젯 캐시 비우기 실패:", err);
  }
}
