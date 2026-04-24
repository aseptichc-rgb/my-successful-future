/**
 * 단순 TTL 기반 인메모리 캐시.
 * - Next.js 서버리스(Lambda) 환경에서는 인스턴스 수명 동안만 유효.
 * - Firestore 조회 결과처럼 변경 빈도가 낮고 레이턴시 민감한 데이터에 사용.
 * - 동시 요청이 와도 같은 키의 promise를 공유하여 thundering-herd 를 방지한다.
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const DEFAULT_MAX_ENTRIES = 500;

export class TTLCache<T> {
  private store = new Map<string, CacheEntry<T>>();
  private inflight = new Map<string, Promise<T>>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries: number = DEFAULT_MAX_ENTRIES
  ) {}

  get(key: string): T | undefined {
    const hit = this.store.get(key);
    if (!hit) return undefined;
    if (Date.now() > hit.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return hit.value;
  }

  set(key: string, value: T): void {
    if (this.store.size >= this.maxEntries) {
      // 간이 LRU: 가장 오래된 키 1개 제거 (Map은 삽입순 보존)
      const oldest = this.store.keys().next().value;
      if (oldest !== undefined) this.store.delete(oldest);
    }
    this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  /**
   * 캐시 미스 시 loader 를 호출해 값을 채운다.
   * 동일 키에 대한 동시 호출은 하나의 loader 만 실행하고 결과를 공유한다.
   * loader 가 throw 하면 캐시는 채우지 않고 예외를 그대로 전파한다.
   */
  async getOrLoad(key: string, loader: () => Promise<T>): Promise<T> {
    const cached = this.get(key);
    if (cached !== undefined) return cached;

    const pending = this.inflight.get(key);
    if (pending) return pending;

    const promise = (async () => {
      try {
        const value = await loader();
        this.set(key, value);
        return value;
      } finally {
        this.inflight.delete(key);
      }
    })();
    this.inflight.set(key, promise);
    return promise;
  }
}
