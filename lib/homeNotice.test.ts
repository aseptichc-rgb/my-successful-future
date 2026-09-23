import { describe, expect, it } from "vitest";
import { HOME_NOTICE_PRIORITY, pickHomeNotice, type HomeNoticeKind } from "./homeNotice";

const ALL: Record<HomeNoticeKind, boolean> = {
  recommit: true,
  guestLink: true,
  slotUnlock: true,
  stepUp: true,
  declarationNudge: true,
  storeReview: true,
  feedback: true,
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

  it("스토어 리뷰 카드는 1회성 카드들 뒤, 영구 체험 배너들 앞", () => {
    expect(pickHomeNotice({ storeReview: true, declarationNudge: true })).toBe(
      "declarationNudge",
    );
    expect(pickHomeNotice({ storeReview: true, trialExpired: true })).toBe("storeReview");
    expect(pickHomeNotice({ storeReview: true, trial: true })).toBe("storeReview");
  });

  it("게스트 연결 안내는 재약속 바로 다음 — 해금·스텝업보다 앞", () => {
    expect(pickHomeNotice({ guestLink: true, recommit: true })).toBe("recommit");
    expect(pickHomeNotice({ guestLink: true, slotUnlock: true })).toBe("guestLink");
    expect(pickHomeNotice({ guestLink: true, trial: true })).toBe("guestLink");
  });

  it("피드백 카드는 스토어 리뷰 뒤, 체험 배너들 앞", () => {
    expect(pickHomeNotice({ feedback: true, storeReview: true })).toBe("storeReview");
    expect(pickHomeNotice({ feedback: true, trialExpired: true })).toBe("feedback");
    expect(pickHomeNotice({ feedback: true, trial: true })).toBe("feedback");
  });

  it("체험 D-day 배너는 최하위 — 만료 배너보다도 뒤", () => {
    expect(pickHomeNotice({ trial: true, trialExpired: true })).toBe("trialExpired");
    expect(pickHomeNotice({ trial: true })).toBe("trial");
  });
});
