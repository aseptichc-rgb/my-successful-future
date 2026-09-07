import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GOAL_SLOT_THRESHOLDS } from "@/lib/constants/goal";

describe("shouldShowStoreReview", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.unstubAllGlobals());

  it("기준 칸 수는 7일 해금(두 번째 칸)과 같은 임계값을 가리킨다", async () => {
    const { STORE_REVIEW_MIN_EARNED_SLOTS } = await import("./storeReview");
    expect(STORE_REVIEW_MIN_EARNED_SLOTS).toBe(2);
    expect(GOAL_SLOT_THRESHOLDS[STORE_REVIEW_MIN_EARNED_SLOTS - 1]).toBe(7);
  });

  it("앱 안에서 7일 해금에 도달했고 아직 확인하지 않았으면 뜬다", async () => {
    const { shouldShowStoreReview } = await import("./storeReview");
    expect(shouldShowStoreReview({ earned: 2, acked: false, inApp: true })).toBe(true);
    // 더 많이 열었어도(기존 사용자) 한 번은 묻는다.
    expect(shouldShowStoreReview({ earned: 5, acked: false, inApp: true })).toBe(true);
  });

  it("첫 칸만 있는(7일 미만) 사용자에게는 뜨지 않는다", async () => {
    const { shouldShowStoreReview } = await import("./storeReview");
    expect(shouldShowStoreReview({ earned: 1, acked: false, inApp: true })).toBe(false);
    expect(shouldShowStoreReview({ earned: 0, acked: false, inApp: true })).toBe(false);
  });

  it("이미 확인(리뷰 남김·괜찮아요)했으면 다시 뜨지 않는다", async () => {
    const { shouldShowStoreReview } = await import("./storeReview");
    expect(shouldShowStoreReview({ earned: 2, acked: true, inApp: true })).toBe(false);
  });

  it("일반 브라우저(스토어 없음)에서는 뜨지 않는다", async () => {
    const { shouldShowStoreReview } = await import("./storeReview");
    expect(shouldShowStoreReview({ earned: 2, acked: false, inApp: false })).toBe(false);
  });

  it("확인 상태는 localStorage 에 남고, SSR 스냅샷은 항상 숨김 판정", async () => {
    const storage = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
      },
    });
    const { storeReviewAckStore } = await import("./storeReview");

    expect(storeReviewAckStore.getServerSnapshot()).toBe(true);
    expect(storeReviewAckStore.getSnapshot()).toBe(false);

    storeReviewAckStore.acknowledge(true);

    expect(storeReviewAckStore.getSnapshot()).toBe(true);
    expect(storage.get("anima.storeReview.ack")).toBe("1");
  });
});
