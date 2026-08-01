"use client";

import { useSyncExternalStore } from "react";

/**
 * 클라이언트 전용 값(localStorage·navigator·네이티브 브릿지 감지)을 SSR 안전하게 읽는 훅.
 *
 * SSR/하이드레이션은 serverValue 로 그리고, 클라이언트에서 getClientValue() 가 다르면
 * React 가 스스로 재렌더한다 — effect 에서 setState 로 보정할 필요가 없다(hydration
 * mismatch 도 없다). lib/ackStore.ts 와 같은 이유로 이 보일러플레이트는 여기 한 곳에만 둔다.
 *
 * 규칙:
 *  - getClientValue 는 렌더마다 불릴 수 있으므로 가볍고 순수해야 한다(원시값 권장 —
 *    새 객체를 만들어 돌려주면 무한 재렌더).
 *  - 값이 세션 중 바뀌어야 한다면 이 훅이 아니라 구독이 있는 스토어(ackStore)를 쓴다.
 */
const emptySubscribe = () => () => {};

export function useClientValue<T>(getClientValue: () => T, serverValue: T): T {
  return useSyncExternalStore(emptySubscribe, getClientValue, () => serverValue);
}
