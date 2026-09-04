import { describe, expect, it } from "vitest";
import { readSheetDeepLink } from "./sheetDeepLink";

describe("readSheetDeepLink", () => {
  it("유효한 시트 값을 읽는다", () => {
    expect(readSheetDeepLink("?sheet=goals")).toEqual({ sheet: "goals", refine: false });
    expect(readSheetDeepLink("?sheet=affirmations")).toEqual({
      sheet: "affirmations",
      refine: false,
    });
    expect(readSheetDeepLink("?sheet=futureSelf")).toEqual({ sheet: "futureSelf", refine: false });
  });

  it("refine=1 은 goals 시트에서만 참이다", () => {
    expect(readSheetDeepLink("?sheet=goals&refine=1")).toEqual({ sheet: "goals", refine: true });
    expect(readSheetDeepLink("?sheet=affirmations&refine=1")).toEqual({
      sheet: "affirmations",
      refine: false,
    });
    expect(readSheetDeepLink("?refine=1")).toEqual({ sheet: null, refine: false });
  });

  it("모르는 시트·빈 문자열은 null", () => {
    expect(readSheetDeepLink("?sheet=nope")).toEqual({ sheet: null, refine: false });
    expect(readSheetDeepLink("")).toEqual({ sheet: null, refine: false });
    expect(readSheetDeepLink("?fromApp=1&nativeToken=x")).toEqual({ sheet: null, refine: false });
  });

  it("다른 쿼리와 섞여 있어도 시트만 골라낸다", () => {
    expect(readSheetDeepLink("?fromApp=1&sheet=goals&refine=1&nativeToken=x")).toEqual({
      sheet: "goals",
      refine: true,
    });
  });
});
