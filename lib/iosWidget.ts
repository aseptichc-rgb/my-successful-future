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

/** registerPlugin 으로 만든 JS 프록시 이름 — isPluginAvailable 진단 로그에서 참조. */
const PLUGIN_NAME = "WidgetBridge";

/**
 * iOS 네이티브에서 위젯 브릿지를 시도할지 여부. SSR/웹/안드로이드에선 false.
 *
 * 주의: 과거엔 `Capacitor.isPluginAvailable("WidgetBridge")` 까지 AND 했으나, 이 앱은
 * server.url(원격 웹) 모드라 원격 페이지가 네이티브 브릿지의 PluginHeaders 주입보다 먼저
 * 평가되면 isPluginAvailable 이 false 를 반환해 위젯 갱신이 영구 no-op 으로 떨어지는
 * 회귀가 있었다(위젯이 늘 빈 상태). 플러그인은 바이너리에 분명히 포함돼 있으므로,
 * 게이트는 플랫폼만 보고 실제 호출 실패는 각 함수의 try-catch 가 안전하게 흡수한다.
 */
export function isIosWidgetAvailable(): boolean {
  try {
    return Capacitor.getPlatform() === "ios";
  } catch {
    return false;
  }
}

/**
 * 위젯 브릿지 진단 한 줄 — Safari Web Inspector 콘솔에서 원인 추적용.
 * PluginHeaders 에 플러그인이 안 보이는데도 호출을 시도하는지(원격 모드 회귀)를 드러낸다.
 */
function widgetBridgeDiagnostics(): string {
  try {
    const headerVisible = Capacitor.isPluginAvailable(PLUGIN_NAME);
    return `platform=${Capacitor.getPlatform()} pluginHeaderVisible=${headerVisible}`;
  } catch (err) {
    return `진단 수집 실패: ${err instanceof Error ? err.message : String(err)}`;
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
    console.info("[iosWidget] 위젯 데이터 전달 성공", `(${widgetBridgeDiagnostics()})`);
  } catch (err) {
    // 여기서 reject 되면 둘 중 하나다: (1) 네이티브 플러그인 미등록(원격 모드 PluginHeaders 누락),
    // (2) App Group 접근 불가(WidgetBridgePlugin 의 명시적 reject). 진단 문자열로 구분한다.
    console.warn("[iosWidget] 위젯 데이터 전달 실패:", err, `(${widgetBridgeDiagnostics()})`);
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

/**
 * [진단용] 위젯 데이터를 푸시하되 성공/실패를 호출자에게 그대로 반환한다(에러를 삼키지 않음).
 * 화면 진단 배너가 실제 실패 사유(플러그인 미등록 vs App Group 불가)를 표시하는 데 쓴다.
 */
export async function pushWidgetDataDiagnostic(
  data: unknown,
): Promise<{ ok: boolean; error?: string }> {
  if (!isIosWidgetAvailable()) return { ok: false, error: "iOS 네이티브 아님" };
  try {
    await WidgetBridge.setWidgetData({ json: JSON.stringify(data) });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
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
