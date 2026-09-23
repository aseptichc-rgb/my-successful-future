import { describe, expect, it } from "vitest";
import { sanitizeEventProps } from "./events";
import { EVENT_PROPS_MAX_KEYS, EVENT_PROPS_MAX_STRING, isEventName } from "./constants/events";

describe("sanitizeEventProps", () => {
  it("객체가 아니면 빈 props", () => {
    expect(sanitizeEventProps(undefined)).toEqual({});
    expect(sanitizeEventProps(null)).toEqual({});
    expect(sanitizeEventProps("x")).toEqual({});
    expect(sanitizeEventProps([1, 2])).toEqual({});
  });

  it("문자열·숫자·불리언만 남기고 중첩 값은 버린다", () => {
    expect(
      sanitizeEventProps({
        source: "sheet",
        n: 3,
        ok: true,
        nested: { a: 1 },
        list: [1],
        nil: null,
        nan: Number.NaN,
      }),
    ).toEqual({ source: "sheet", n: 3, ok: true });
  });

  it("문자열은 최대 길이로 자르고 키 수도 제한한다", () => {
    const long = "x".repeat(EVENT_PROPS_MAX_STRING + 50);
    expect(sanitizeEventProps({ s: long }).s).toHaveLength(EVENT_PROPS_MAX_STRING);

    const many: Record<string, number> = {};
    for (let i = 0; i < EVENT_PROPS_MAX_KEYS + 5; i++) many[`k${i}`] = i;
    expect(Object.keys(sanitizeEventProps(many))).toHaveLength(EVENT_PROPS_MAX_KEYS);
  });
});

describe("isEventName", () => {
  it("화이트리스트만 통과", () => {
    expect(isEventName("app_open")).toBe(true);
    expect(isEventName("purchase_completed")).toBe(true);
    expect(isEventName("made_up")).toBe(false);
    expect(isEventName(42)).toBe(false);
  });
});
