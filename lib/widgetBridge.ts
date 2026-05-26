/**
 * 웹(TWA) → 네이티브 위젯 즉시 갱신 브릿지.
 *
 * 동작:
 *   - 사용자가 홈 화면에서 다짐 따라쓰기 · 행동 체크 · 잘한 일 3가지를 저장한 직후,
 *     이 함수가 anima://widget-refresh 인텐트를 발화한다.
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
 * Chrome user-activation 회귀:
 *   - Chrome 86+ 의 intent:// iframe 정책: 최근 user gesture 가 없는 컨텍스트에서의
 *     iframe-기반 intent 발화는 silent 하게 차단된다. setTimeout(디바운스) 또는 비동기
 *     리스너 안에서 발사하면 종종 묻혀버린다.
 *   - 회피: iframe 발사 + `<a>.click()` 발사 2단계로 시도해 한쪽이 막혀도 다른 쪽이 도달
 *     가능성을 높인다. 더하여 발사 직후 user gesture 가 살아 있으면 즉시 한번 더 시도한다.
 *
 * 보안:
 *   - 이 브릿지는 어떤 사용자 데이터도 인텐트에 싣지 않는다. "갱신 트리거" 라는 사실만 전달.
 *   - Worker 가 다시 ID 토큰으로 /api/widget/today 를 호출하므로 권한 검증은 그대로 보장.
 */

const FROM_APP_FLAG_KEY = "anima.fromApp";
const REFRESH_INTENT_URL =
  "intent://widget-refresh#Intent;scheme=anima;package=com.michaelkim.anima;end";
const SIGNOUT_INTENT_URL =
  "intent://signout#Intent;scheme=anima;package=com.michaelkim.anima;end";
const DEDUP_WINDOW_MS = 1500;
const IFRAME_CLEANUP_MS = 1000;

// 인텐트 종류별 마지막 발화 시각 — 같은 인텐트의 연속 발화만 흡수하고,
// 서로 다른 인텐트(예: signout 직후 widget-refresh) 는 서로 영향을 주지 않게 분리한다.
const lastFiredAt: Record<string, number> = {};

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
 * intent:// URL 을 두 가지 경로로 발사한다.
 *  1) hidden iframe.src — Chrome 이 OS intent 로 해석하는 정통 경로.
 *  2) 프로그래매틱 `<a>.click()` — 호출이 user gesture 핸들러 안에서 실행됐다면
 *     iframe 보다 user-activation 패스를 더 잘 통과한다.
 *
 * Chrome 의 intent 처리는 동기적으로 결정되므로 두 발사 모두 실패하더라도 throw 가 일어나지 않아
 * 호출자 흐름에는 영향이 없다. 우리는 "둘 중 하나는 도달한다" 는 확률을 끌어올린다.
 */
/**
 * Chrome 의 "최근 user-activation" 윈도우는 ~5초. 직전 사용자 입력 시각을 기록해 두고,
 * 발화 시점에 이 윈도우 안이면 location.href 같은 강한 패스도 시도한다.
 *
 * 클릭/터치 외에도 키보드 입력, 폼 submit 등이 user-activation 을 갱신하므로 광범위하게 감지.
 */
const USER_ACTIVATION_WINDOW_MS = 4_500;
let lastUserGestureAt = 0;

function installUserGestureTracker(): void {
  if (typeof window === "undefined") return;
  if ((window as unknown as { __animaUgInstalled?: boolean }).__animaUgInstalled) return;
  (window as unknown as { __animaUgInstalled?: boolean }).__animaUgInstalled = true;
  const mark = () => {
    lastUserGestureAt = Date.now();
  };
  const opts: AddEventListenerOptions = { capture: true, passive: true };
  document.addEventListener("pointerdown", mark, opts);
  document.addEventListener("keydown", mark, opts);
  document.addEventListener("touchstart", mark, opts);
}

function hasFreshUserGesture(): boolean {
  return Date.now() - lastUserGestureAt < USER_ACTIVATION_WINDOW_MS;
}

function fireIntentMultiPath(intentUrl: string): void {
  // Path 1: hidden iframe — TWA Chrome 이 이 패스를 가장 잘 인식한다.
  try {
    const iframe = document.createElement("iframe");
    iframe.style.display = "none";
    iframe.setAttribute("aria-hidden", "true");
    iframe.src = intentUrl;
    document.body.appendChild(iframe);
    window.setTimeout(() => {
      try {
        iframe.remove();
      } catch {
        // DOM 정리 실패는 무시 — GC 가 결국 청소한다.
      }
    }, IFRAME_CLEANUP_MS);
  } catch {
    // iframe 경로 실패 — 두 번째 경로로 계속.
  }

  // Path 2: programmatic <a>.click() — user-activation 컨텍스트에서 강력하다.
  // iframe 과 둘 다 시도해도 Android 시스템이 단일 호출로 합쳐 처리하므로 중복 트리거 위험 낮음
  // (WorkScheduler 가 REPLACE 정책이라 OneTime Worker 는 어차피 한 번만 큐잉됨).
  try {
    const a = document.createElement("a");
    a.href = intentUrl;
    a.rel = "noopener";
    // a.target 를 _self 로 두면 navigation 이 발생할 수 있어 위험. 인텐트 URL 은 navigation 이
    // 일어나도 Chrome 이 intent 로 가로채지만, 만약 가로채지 못하면 ERR_UNKNOWN_URL_SCHEME 페이지가
    // 노출될 수 있다. _blank 로 두면 새 컨텍스트로 보내며 TWA 가 그대로 살아남는다.
    a.target = "_blank";
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    window.setTimeout(() => {
      try {
        a.remove();
      } catch {
        // 무시
      }
    }, IFRAME_CLEANUP_MS);
  } catch {
    // 두 경로 모두 실패 — 위젯은 다음 정주기 Worker (3시간) 또는 사용자 다음 인터랙션에서 봉합.
  }

  // Path 3: user-activation 이 살아 있을 때만 hidden <form target="_self" action=intent...> submit.
  // Chrome 은 폼 submit 을 user-activation 으로 강하게 인정해 intent 가로채기 확률이 높다.
  // window 가 _self 로 navigate 되면 Chrome 이 intent 로 가로채고 페이지는 그대로 유지된다.
  // 가로채지 못하면 navigation 이 발생할 수 있으므로 hasFreshUserGesture() 일 때만 시도.
  if (!hasFreshUserGesture()) return;
  try {
    const form = document.createElement("form");
    form.action = intentUrl;
    form.method = "GET";
    form.target = "_self";
    form.style.display = "none";
    document.body.appendChild(form);
    form.submit();
    window.setTimeout(() => {
      try {
        form.remove();
      } catch {
        // 무시
      }
    }, IFRAME_CLEANUP_MS);
  } catch {
    // 무시 — 앞 두 경로 중 하나가 도달했을 것.
  }
}

/**
 * @param key 디바운스 키 — 동일 키 호출은 [DEDUP_WINDOW_MS] 이내라면 1회로 합친다.
 */
function fireIntent(intentUrl: string, key: string): void {
  try {
    if (!isInsideAndroidApp()) return;
    // 첫 호출 시 user-gesture tracker 를 lazy install — bundle 이 처음 로드된 직후엔 아직
    // 사용자 입력이 없을 수 있으므로 이 시점에 등록해 두면 이후 인터랙션을 모두 catch.
    installUserGestureTracker();

    const now = Date.now();
    if (now - (lastFiredAt[key] ?? 0) < DEDUP_WINDOW_MS) return;
    lastFiredAt[key] = now;

    fireIntentMultiPath(intentUrl);
  } catch {
    // intent 발화 실패는 호출자 흐름에 영향 주지 않는다 — 다음 동작 사이클에서 봉합.
  }
}

/**
 * 위젯 즉시 갱신 인텐트 발화. TWA 환경이 아니면 즉시 반환(no-op).
 * 어떤 예외도 호출자에게 전파하지 않는다 — "저장은 성공했는데 위젯만 못 깨운" 시나리오는
 * 다음 정주기 Worker 가 봉합하므로 사용자 흐름에 영향 0.
 *
 * 가능하면 user gesture 핸들러(클릭/탭 직후) 안에서 호출해야 Chrome user-activation 패스를
 * 통과할 확률이 높다. 디바운스/setTimeout 안에서 호출하는 경로는 가능하면 user gesture 경로로
 * 한 번 더 보완해 주는 것이 안전하다.
 */
export function notifyAndroidWidgetRefresh(): void {
  fireIntent(REFRESH_INTENT_URL, "widget-refresh");
}

/**
 * 웹 로그아웃 직후 네이티브 세션·위젯 캐시 정리 인텐트 발화.
 *
 * 왜 필요한가:
 *   - 웹 /settings 에서 로그아웃 → 웹 FirebaseAuth 세션만 종료된다.
 *   - 네이티브 FirebaseAuth 와 위젯 캐시(QuoteCache) 는 그대로 남아 홈 화면 위젯이
 *     "이전 계정의 명언/체크리스트" 를 계속 노출하는 회귀가 발생했다.
 *
 * 이 함수가 발화하는 anima://signout 을 [SignOutBridgeActivity] 가 받아
 * AuthRepository.signOut → 위젯 캐시 정리 → updateAll 까지 한 번에 처리한다.
 *
 * 다른 브라우저(TWA 가 아닌 환경) 에서는 no-op — fireIntent 가 자체 가드한다.
 */
export function notifyAndroidSignOut(): void {
  fireIntent(SIGNOUT_INTENT_URL, "signout");
}
