import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  platform: "web",
  requestReview: vi.fn<() => Promise<void>>(),
  isAndroidApp: vi.fn(() => false),
  notifyAndroidStoreReview: vi.fn(),
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    getPlatform: () => mocks.platform,
  },
  registerPlugin: () => ({
    requestReview: mocks.requestReview,
  }),
}));

vi.mock("@/lib/widgetBridge", () => ({
  isAndroidApp: mocks.isAndroidApp,
  notifyAndroidStoreReview: mocks.notifyAndroidStoreReview,
}));

import {
  APP_STORE_WRITE_REVIEW_URL,
  isStoreReviewAvailable,
  requestStoreReview,
} from "@/lib/storeReviewBridge";
import { APP_STORE_URL } from "@/lib/constants/storeLinks";

describe("storeReviewBridge", () => {
  beforeEach(() => {
    mocks.platform = "web";
    mocks.isAndroidApp.mockReturnValue(false);
    mocks.requestReview.mockReset();
    mocks.notifyAndroidStoreReview.mockReset();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("일반 브라우저에서는 리뷰 요청이 불가하고 아무 브릿지도 부르지 않는다", async () => {
    expect(isStoreReviewAvailable()).toBe(false);

    await requestStoreReview();

    expect(mocks.requestReview).not.toHaveBeenCalled();
    expect(mocks.notifyAndroidStoreReview).not.toHaveBeenCalled();
  });

  it("iOS 앱에서는 네이티브 StoreReviewBridge.requestReview 를 부른다", async () => {
    mocks.platform = "ios";
    mocks.requestReview.mockResolvedValue(undefined);
    const open = vi.fn();
    vi.stubGlobal("window", { open });

    expect(isStoreReviewAvailable()).toBe(true);
    await requestStoreReview();

    expect(mocks.requestReview).toHaveBeenCalledTimes(1);
    expect(mocks.notifyAndroidStoreReview).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
  });

  it("iOS 플러그인이 없는 구 바이너리면 App Store 리뷰 작성 페이지로 폴백한다", async () => {
    mocks.platform = "ios";
    mocks.requestReview.mockRejectedValue(new Error('"StoreReviewBridge" plugin is not implemented on ios'));
    const open = vi.fn();
    vi.stubGlobal("window", { open });
    vi.spyOn(console, "warn").mockImplementation(() => {});

    await requestStoreReview();

    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith(APP_STORE_WRITE_REVIEW_URL, "_blank", "noopener");
    expect(APP_STORE_WRITE_REVIEW_URL).toBe(`${APP_STORE_URL}?action=write-review`);
  });

  it("Android TWA 에서는 네이티브 인앱 리뷰 인텐트를 발화한다", async () => {
    mocks.isAndroidApp.mockReturnValue(true);

    expect(isStoreReviewAvailable()).toBe(true);
    await requestStoreReview();

    expect(mocks.notifyAndroidStoreReview).toHaveBeenCalledTimes(1);
    expect(mocks.requestReview).not.toHaveBeenCalled();
  });
});
