import { describe, expect, it } from "vitest";
import { HOME_NOTICE_PRIORITY, pickHomeNotice, type HomeNoticeKind } from "./homeNotice";

const ALL: Record<HomeNoticeKind, boolean> = {
  recommit: true,
  slotUnlock: true,
  stepUp: true,
  declarationNudge: true,
  trialExpired: true,
  trial: true,
};

describe("pickHomeNotice", () => {
  it("아무것도 자격이 없으면 null", () => {
    expect(pickHomeNotice({})).toBeNull();
    expect(pickHomeNotice({ trial: false, recommit: false })).toBeNull();
  });

  it("전부 자격이 있으면 재약속이 1순위", () => {
    expect(pickHomeNotice(ALL)).toBe("recommit");
  });

  it("우선순위 배열 순서대로 하나씩 빠지면 다음 것이 뜬다", () => {
    const eligible = { ...ALL };
    for (const kind of HOME_NOTICE_PRIORITY) {
      expect(pickHomeNotice(eligible)).toBe(kind);
      eligible[kind] = false;
    }
    expect(pickHomeNotice(eligible)).toBeNull();
  });

  it("1회성(슬롯 해금·스텝업·선언 안내)이 체험 만료 배너를 이긴다", () => {
    expect(pickHomeNotice({ trialExpired: true, slotUnlock: true })).toBe("slotUnlock");
    expect(pickHomeNotice({ trialExpired: true, stepUp: true })).toBe("stepUp");
    expect(pickHomeNotice({ trialExpired: true, declarationNudge: true })).toBe(
      "declarationNudge",
    );
  });

  it("체험 D-day 배너는 최하위 — 만료 배너보다도 뒤", () => {
    expect(pickHomeNotice({ trial: true, trialExpired: true })).toBe("trialExpired");
    expect(pickHomeNotice({ trial: true })).toBe("trial");
  });
});
