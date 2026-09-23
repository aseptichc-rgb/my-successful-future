/**
 * 제품 이벤트 이름 — 퍼널·리텐션 계측의 유일한 어휘표.
 *
 * 왜 화이트리스트인가: 클라이언트가 임의 문자열을 보내면 컬렉션이 오타·실험 이름으로
 * 오염돼 집계가 무의미해진다. 서버(/api/events)는 여기 없는 이름을 400 으로 거절한다.
 *
 * 이벤트는 "어디서 찍히는가" 로 두 부류다:
 *   서버 진실  — 결제·체험처럼 서버만 확정할 수 있는 사실. 라우트 안에서 직접 logEvent.
 *   클라 관측  — 화면 노출·탭처럼 서버가 볼 수 없는 행동. lib/track 이 /api/events 로 보낸다.
 *
 * 최소 퍼널: trial_started(=가입) → onboarding_completed → app_open(D1/D7) →
 *            paywall_viewed → purchase_started → purchase_completed
 */
export const EVENT_NAMES = [
  /** 서버. 신규 체험 발급 = 사실상 첫 가입 (start-trial 이 alreadyStarted=false 를 돌려줄 때). */
  "trial_started",
  /** 클라. 온보딩 마지막 화면에서 시작/건너뛰기 — props.skipped. */
  "onboarding_completed",
  /** 클라. 로그인 상태로 탭 화면 진입. 기기별 KST 하루 1회로 중복 제거 — D1/D7 리텐션의 원천. */
  "app_open",
  /** 서버. Pro 전용 라우트가 402 를 돌려줌 — props.path, props.reason. */
  "paywall_blocked",
  /** 클라. 업셀 시트 또는 체험 만료 배너가 실제로 화면에 그려짐 — props.source. */
  "paywall_viewed",
  /** 클라. 설정 ANIMA PRO 의 구매 버튼 탭 — props.platform. */
  "purchase_started",
  /** 서버. 영수증 검증 완료·권한 부여 — props.platform, props.productId. */
  "purchase_completed",
  /** 클라. 피드백 카드가 홈 알림 슬롯에 그려짐. */
  "feedback_card_shown",
  /** 클라. 피드백 카드 "괜찮아요". */
  "feedback_card_dismissed",
  /** 서버. 피드백 저장 완료 — props.contactOk. */
  "feedback_submitted",
  /** 클라. 스트릭 카드 공유 시트가 실제로 열림(공유 완료 여부는 OS 가 알려주지 않는다) — props.method. */
  "streak_shared",
] as const;

export type EventName = (typeof EVENT_NAMES)[number];

export function isEventName(value: unknown): value is EventName {
  return typeof value === "string" && (EVENT_NAMES as ReadonlyArray<string>).includes(value);
}

/** props 한 건에 허용하는 최대 키 수 — 자유 형식 payload 가 되는 것을 막는다. */
export const EVENT_PROPS_MAX_KEYS = 8;
/** props 문자열 값 최대 길이 — 개인 텍스트(다짐·목표 본문)가 실려 오는 것을 막는다. */
export const EVENT_PROPS_MAX_STRING = 100;

/** 이벤트 발생 플랫폼 — 클라이언트가 자기 환경을 보고 붙인다. */
export const EVENT_PLATFORMS = ["android", "ios", "web"] as const;
export type EventPlatform = (typeof EVENT_PLATFORMS)[number];

export function isEventPlatform(value: unknown): value is EventPlatform {
  return typeof value === "string" && (EVENT_PLATFORMS as ReadonlyArray<string>).includes(value);
}
