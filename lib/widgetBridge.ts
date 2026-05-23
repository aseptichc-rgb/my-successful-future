/**
 * 웹(TWA) → 네이티브 위젯 즉시 갱신 브릿지.
 *
 * 동작:
 *   - 사용자가 홈 화면에서 다짐 따라쓰기 · 행동 체크 · 잘한 일 3가지를 저장한 직후,
 *     이 함수가 anima://widget-refresh 인텐트를 hidden iframe 으로 발화한다.
 *   - Chrome 이 OS intent 로 해석 → WidgetRefreshBridgeActivity (NoDisplay) 가 즉시 종료되며
 *     OneTime QuoteRefreshWorker 를 enqueue → 위젯 RemoteViews 가 새 진척도로 재렌더된다.
 *   - top-level navigation 이 아니므로 TWA 가 그대로 살아 있다(사용자 시각적 인터럽트 0).
 *
 * 정책:
 *   - TWA 환경이 아닌 일반 브라우저에서는 no-op — 인텐트가 발화되어도 핸들러가 없어 무해하지만
 *     iframe 자체를 만들지 않아 DOM 부하 0.
 *   - 호출 시점은 "쓰기 트랜잭션 성공 직후" — 실패한 저장으로 위젯이 헛 갱신되지 않도록.
 *   - 디바운스(소프트): 동일 인텐트를 너무 짧은 간격으로 연속 발화하면 OS/Chrome 이 한 번
 *     무시할 수 있다. 사용자 입력 속도 기준으론 거의 영향 없지만, 동일 프레임 내 중복 호출을
 *     막기 위해 [DEDUP_WINDOW_MS] 이내 호출은 합쳐 1회만 쏜다.
 *
 * 보안:
 *   - 이 브릿지는 어떤 사용자 데이터도 인텐트에 싣지 않는다. "갱신 트리거" 라는 사실만 전달.
 *   - Worker 가 다시 ID 토큰으로 /api/widget/today 를 호출하므로 권한 검증은 그대로 보장.
 */

const FROM_APP_FLAG_KEY = "anima.fromApp";
const INTENT_URL =
  "intent://widget-refresh#Intent;scheme=anima;package=com.michaelkim.anima;end";
const DEDUP_WINDOW_MS = 1500;
const IFRAME_CLEANUP_MS = 1000;

let lastFiredAt = 0;

/**
 * TWA(안드로이드 네이티브 앱) 안에서 띄워진 세션인지 판정.
 * [auth-context.tsx#isInsideAndroidApp] 과 동일 로직 — 분리해 두지 않으면 순환 의존이 생긴다.
 */
function isInsideAndroidApp(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.get("fromApp") === "1") {
      window.sessionStorage.setItem(FROM_APP_FLAG_KEY, "1");
      return true;
    }
    if (window.sessionStorage.getItem(FROM_APP_FLAG_KEY) === "1") return true;
    if (document.referrer.startsWith("android-app://com.michaelkim.anima")) {
      window.sessionStorage.setItem(FROM_APP_FLAG_KEY, "1");
      return true;
    }
  } catch {
    // sessionStorage 차단 — 브릿지 건너뛴다 (실패해도 웹 동작엔 영향 없음).
  }
  return false;
}

/**
 * 위젯 즉시 갱신 인텐트 발화. TWA 환경이 아니면 즉시 반환(no-op).
 * 어떤 예외도 호출자에게 전파하지 않는다 — "저장은 성공했는데 위젯만 못 깨운" 시나리오는
 * 다음 정주기 Worker 가 봉합하므로 사용자 흐름에 영향 0.
 */
export function notifyAndroidWidgetRefresh(): void {
  try {
    if (!isInsideAndroidApp()) return;

    // 디바운스: 사용자가 연속 저장 버튼을 눌러도 1.5초 이내라면 한 번만 발화.
    const now = Date.now();
    if (now - lastFiredAt < DEDUP_WINDOW_MS) return;
    lastFiredAt = now;

    const iframe = document.createElement("iframe");
    iframe.style.display = "none";
    iframe.setAttribute("aria-hidden", "true");
    iframe.src = INTENT_URL;
    document.body.appendChild(iframe);
    window.setTimeout(() => {
      try {
        iframe.remove();
      } catch {
        // DOM 정리 실패는 무시 — GC 가 결국 청소한다.
      }
    }, IFRAME_CLEANUP_MS);
  } catch {
    // intent 발화 실패는 정주기 Worker(3시간) 가 봉합. 사용자에게 노출할 가치 없음.
  }
}
