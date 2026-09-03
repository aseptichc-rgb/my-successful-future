import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authedFetch: vi.fn(),
  setWidgetData: vi.fn(),
  clearWidgetData: vi.fn(),
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    getPlatform: () => "ios",
    isPluginAvailable: () => true,
  },
  registerPlugin: () => ({
    setWidgetData: mocks.setWidgetData,
    clearWidgetData: mocks.clearWidgetData,
  }),
}));

vi.mock("@/lib/authedFetch", () => ({
  authedFetch: mocks.authedFetch,
}));

import { clearIosWidget, refreshIosWidget } from "@/lib/iosWidget";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function widgetResponse(label: string): Response {
  return new Response(JSON.stringify({ ymd: "2026-09-03", slots: [{ text: label }] }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("iOS widget refresh ordering", () => {
  beforeEach(() => {
    mocks.authedFetch.mockReset();
    mocks.setWidgetData.mockReset().mockResolvedValue(undefined);
    mocks.clearWidgetData.mockReset().mockResolvedValue(undefined);
  });

  it("does not let an older slow response overwrite the latest response", async () => {
    const first = deferred<Response>();
    const second = deferred<Response>();
    mocks.authedFetch.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

    const oldRefresh = refreshIosWidget();
    const latestRefresh = refreshIosWidget();

    second.resolve(widgetResponse("latest"));
    await latestRefresh;
    first.resolve(widgetResponse("stale"));
    await oldRefresh;

    expect(mocks.setWidgetData).toHaveBeenCalledTimes(1);
    expect(JSON.parse(mocks.setWidgetData.mock.calls[0][0].json).slots[0].text).toBe("latest");
  });

  it("invalidates an in-flight account refresh when the user signs out", async () => {
    const pending = deferred<Response>();
    mocks.authedFetch.mockReturnValueOnce(pending.promise);

    const refresh = refreshIosWidget();
    await clearIosWidget();
    pending.resolve(widgetResponse("previous-account"));
    await refresh;

    expect(mocks.clearWidgetData).toHaveBeenCalledTimes(1);
    expect(mocks.setWidgetData).not.toHaveBeenCalled();
  });
});
