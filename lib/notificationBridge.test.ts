import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NotificationPrefs } from "@/types";
import type { NotificationTexts } from "@/lib/notificationPolicy";

const mocks = vi.hoisted(() => ({
  sync: vi.fn(),
  clearAll: vi.fn(),
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    getPlatform: () => "ios",
  },
  registerPlugin: () => ({
    sync: mocks.sync,
    clearAll: mocks.clearAll,
  }),
}));

import {
  hasShownIosNotificationPrompt,
  syncIosNotifications,
} from "@/lib/notificationBridge";

/** node 환경에는 localStorage 가 없어 Map 기반 최소 구현으로 대체한다. */
function fakeLocalStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
  };
}

const prefs: NotificationPrefs = {
  morningEnabled: true,
  morningHour: 8,
  eveningEnabled: true,
  eveningHour: 21,
  weeklyReviewEnabled: true,
  pendingTaskEnabled: true,
};

const texts = {
  morning: { title: "t", body: "b" },
  evening: { title: "t", body: "b" },
  weekly: { title: "t", body: "b" },
} as unknown as NotificationTexts;

function syncInput(allowPrompt: boolean) {
  return { prefs, todayGoalDone: false, allowPrompt, texts };
}

describe("iOS 알림 권한 프롬프트 1회 기록", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", fakeLocalStorage());
    mocks.sync.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("초기 상태에서는 '안 띄움' — 홈 방문이 첫 프롬프트를 허용할 수 있어야 한다", () => {
    expect(hasShownIosNotificationPrompt()).toBe(false);
  });

  it("allowPrompt=true sync 성공 후에는 '띄움' 으로 기록된다", async () => {
    await syncIosNotifications(syncInput(true));
    expect(mocks.sync).toHaveBeenCalledTimes(1);
    expect(hasShownIosNotificationPrompt()).toBe(true);
  });

  it("allowPrompt=false sync 는 기록을 남기지 않는다", async () => {
    await syncIosNotifications(syncInput(false));
    expect(hasShownIosNotificationPrompt()).toBe(false);
  });

  it("네이티브 호출이 실패하면 기록하지 않는다 — 다음 sync 가 다시 프롬프트를 시도해야 한다", async () => {
    mocks.sync.mockRejectedValueOnce(new Error("bridge down"));
    await syncIosNotifications(syncInput(true));
    expect(hasShownIosNotificationPrompt()).toBe(false);
  });

  it("localStorage 접근이 막혀도 '안 띄움' 으로 판정한다(프롬프트 허용이 안전한 방향)", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
    });
    expect(hasShownIosNotificationPrompt()).toBe(false);
  });
});
