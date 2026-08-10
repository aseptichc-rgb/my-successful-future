"use client";

/**
 * Pro 기능 요청 거부(402) 신호 버스 — "방금 시도한 기능은 이용권이 필요하다" 는 사실 하나를
 * 앱 전역에 알린다.
 *
 * 무엇을 막는 신호가 **아닌지** 부터: 무료 티어는 오늘의 카드·위젯·체크인·기록을 계속 쓴다
 * (정책표는 lib/constants/quota.ts). 402 는 사용자가 Pro 전용 기능을 명시적으로 눌렀을 때만
 * 떨어지므로, 이 신호를 받는 [ProUpsellSheet] 도 화면을 잠그지 않고 닫을 수 있는 유도 시트다.
 *
 * 왜 별도 모듈인가 (판정 이중화 방지):
 *   접근 허용 여부의 유일한 진실은 서버이고, 그 스위치도 ENTITLEMENT_REQUIRED 하나뿐이다.
 *   클라이언트가 trialEndsAt 을 직접 보고 "만료됐으니 띄우자" 고 판단하면 판정이 두 벌이 되어,
 *   서버 플래그가 꺼진 상태에서도 결제를 조르는 사고가 난다. 그래서 여기서는 오직 [authedFetch]
 *   가 실제로 관측한 402 만 신호로 올린다. 서버 플래그를 끄면 402 가 안 오고 → 시트도 사라진다.
 *
 * 상태를 모듈 스코프에 두는 이유:
 *   402 는 시트가 마운트되기 전(콜드부트 직후 첫 API 호출)에도 발생할 수 있다. 늦게 구독한
 *   쪽도 [getPaymentRequired] 로 현재 상태를 즉시 따라잡게 한다.
 *
 * 해제 지점은 둘뿐이다 — 사용자가 시트를 닫았을 때, 그리고 권한이 실제로 회복됐을 때(결제/복원).
 * 임의의 200 응답으로는 풀지 않는다: 무료로 열린 라우트도 200 을 주므로 그걸로 해제하면
 * 시트가 뜨자마자 사라진다.
 */

// useSyncExternalStore 규약에 맞춰 리스너는 인자를 받지 않는다 — 값은 getPaymentRequired 로 읽는다.
/**
 * Pro 전용 기능이 거부됐을 때 서버가 돌려주는 상태 코드
 * (lib/authServer.ts 의 requirePaidUser 가 던지는 AuthError(402) 와 짝을 이룬다).
 */
export const PAYMENT_REQUIRED_STATUS = 402;

/**
 * 이 응답이 "이용권이 필요하다" 인지.
 *
 * 호출부에서 쓰는 이유: 402 는 [ProUpsellSheet] 가 이미 문맥 있는 안내를 띄우므로, 각 화면이
 * 인라인 에러 문구까지 겹쳐 보여주면 같은 말을 두 번 하게 된다. 402 면 조용히 빠져나오고
 * 나머지 실패만 화면에 표시할 것.
 */
export function isPaymentRequired(res: Response): boolean {
  return res.status === PAYMENT_REQUIRED_STATUS;
}

type Listener = () => void;

let blocked = false;
const listeners = new Set<Listener>();

function emit(): void {
  // 구독자 하나가 던지더라도 나머지에게는 신호가 도달해야 한다.
  for (const listener of [...listeners]) {
    try {
      listener();
    } catch (err) {
      console.warn("[paymentRequired] 구독자 콜백 실패:", err);
    }
  }
}

/** 서버가 402 를 돌려줬다 — 업그레이드 시트를 띄운다. 이미 켜져 있으면 no-op. */
export function notifyPaymentRequired(): void {
  if (blocked) return;
  blocked = true;
  emit();
}

/** 사용자가 시트를 닫았거나 권한이 회복됐다 — 시트를 내린다. 이미 꺼져 있으면 no-op. */
export function clearPaymentRequired(): void {
  if (!blocked) return;
  blocked = false;
  emit();
}

/** 현재 차단 상태. 늦게 마운트된 구독자가 초기값을 따라잡을 때 사용. */
export function getPaymentRequired(): boolean {
  return blocked;
}

/** 차단 상태 변화를 구독한다. 반환된 함수를 호출하면 해제. */
export function subscribePaymentRequired(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
