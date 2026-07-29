/**
 * 1회성 넛지 카드의 "확인함" 상태 저장소 팩토리 — localStorage + useSyncExternalStore 용.
 *
 * SlotUnlockBanner·StepUpCard 처럼 "한 번 보여주고, 확인하면 다시 안 뜨는" 카드가 공유한다.
 * localStorage 는 React 바깥의 저장소이므로 useSyncExternalStore 로 구독해야 하고,
 * 그 보일러플레이트(리스너 Set·스냅샷 캐시·SSR 스냅샷)를 카드마다 복제하면 SSR 센티널
 * 같은 미묘한 규칙을 각자 재발명하다 틀리게 된다 — 그래서 여기 한 곳에만 둔다.
 *
 * 규칙:
 *  - getSnapshot 은 같은 값을 안정적으로 돌려줘야 하므로 스토어 수명 캐시를 둔다.
 *  - serverSnapshot 은 SSR/하이드레이션 전 값 — 항상 "이미 확인함(숨김)" 판정이 나는
 *    값이어야 깜빡임 없이 하이드레이션 후에만 실제 판정이 이뤄진다.
 *  - parse 는 예외를 던지면 안 되고 undefined 를 돌려줘도 안 된다(캐시 미판독 마커와 충돌).
 */
export interface AckStore<T> {
  subscribe: (onChange: () => void) => () => void;
  getSnapshot: () => T;
  getServerSnapshot: () => T;
  acknowledge: (value: T) => void;
}

export function createAckStore<T>(
  storageKey: string,
  opts: {
    /** localStorage 원문(미저장이면 null) → 값. */
    parse: (raw: string | null) => T;
    serialize: (value: T) => string;
    /** SSR 스냅샷 — 항상 숨김 판정이 나는 값. */
    serverSnapshot: T;
  },
): AckStore<T> {
  const listeners = new Set<() => void>();
  let cache: T | undefined;

  const read = (): T => {
    try {
      return opts.parse(window.localStorage.getItem(storageKey));
    } catch {
      return opts.parse(null); // localStorage 불가/SSR — 미저장으로 간주
    }
  };

  return {
    subscribe(onChange) {
      listeners.add(onChange);
      return () => {
        listeners.delete(onChange);
      };
    },
    getSnapshot() {
      if (cache === undefined) cache = read();
      return cache;
    },
    getServerSnapshot: () => opts.serverSnapshot,
    acknowledge(value) {
      cache = value;
      try {
        window.localStorage.setItem(storageKey, opts.serialize(value));
      } catch {
        /* localStorage 불가 환경 — 이번 세션에만 숨긴다 */
      }
      listeners.forEach((l) => l());
    },
  };
}
