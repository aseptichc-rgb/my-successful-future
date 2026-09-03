import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function installBrowser(userActivation: boolean) {
  const storage = new Map<string, string>();
  const createElement = vi.fn(() => ({
    style: {} as Record<string, string>,
    setAttribute: vi.fn(),
    remove: vi.fn(),
    click: vi.fn(),
    submit: vi.fn(),
  }));
  const appendChild = vi.fn();

  vi.stubGlobal("window", {
    location: { href: "https://my-successful-future.vercel.app/home?fromApp=1" },
    sessionStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    },
    setTimeout: vi.fn(),
  });
  vi.stubGlobal("document", {
    referrer: "android-app://com.michaelkim.anima",
    body: { appendChild },
    createElement,
    addEventListener: vi.fn(),
  });
  vi.stubGlobal("navigator", { userActivation: { isActive: userActivation } });

  return { createElement, appendChild };
}

describe("Android widget bridge user activation", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.unstubAllGlobals());

  it("does not fire an intent after Chrome reports activation was consumed", async () => {
    const browser = installBrowser(false);
    const { notifyAndroidWidgetRefresh } = await import("@/lib/widgetBridge");

    notifyAndroidWidgetRefresh();

    expect(browser.createElement).not.toHaveBeenCalled();
    expect(browser.appendChild).not.toHaveBeenCalled();
  });

  it("fires the native refresh intent in the active user gesture", async () => {
    const browser = installBrowser(true);
    const { notifyAndroidWidgetRefresh } = await import("@/lib/widgetBridge");

    notifyAndroidWidgetRefresh();

    expect(browser.createElement).toHaveBeenCalledWith("iframe");
    expect(browser.createElement).toHaveBeenCalledWith("a");
    expect(browser.createElement).toHaveBeenCalledWith("form");
    expect(browser.appendChild).toHaveBeenCalledTimes(3);
  });
});
