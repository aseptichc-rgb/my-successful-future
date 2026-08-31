/**
 * 위젯 upcoming 명언 미리보기(pickUpcomingPreviewQuotes) 단위 테스트.
 *
 * 이 함수는 "앱을 안 열어도 자정마다 위젯 명언이 바뀐다" 기능의 단일 재료 공급원이다.
 * 결정론(같은 입력 → 같은 결과)과 중복 없음(7일이 서로 다른 명언)이 깨지면
 * 위젯이 같은 명언을 반복하거나 홈과 어긋나는 조용한 회귀가 난다.
 */
import { describe, it, expect, vi } from "vitest";

// dailyMotivation 은 서버 전용 의존(firebase-admin·Gemini·정체성 라벨)을 끌고 온다 —
// 순수 함수만 시험하므로 무거운 의존은 전부 모킹해 자격증명 없이 돌게 하고,
// 실수로 네트워크/DB 를 건드리면 즉시 터지게 한다.
vi.mock("@/lib/firebase-admin", () => ({
  getAdminDb: () => {
    throw new Error("테스트에서 Firestore 를 호출하면 안 된다");
  },
}));
vi.mock("@/lib/gemini", () => ({
  generateText: async () => {
    throw new Error("테스트에서 Gemini 를 호출하면 안 된다");
  },
}));
vi.mock("@/lib/identities", () => ({
  ensureIdentities: async () => [],
  readIdentityLabels: async () => [],
}));

import {
  UPCOMING_PREVIEW_DAYS,
  pickUpcomingPreviewQuotes,
} from "@/lib/dailyMotivation";
import { addKstDays } from "@/lib/kstDate";

const BASE = {
  uid: "user-1",
  startYmd: "2026-08-31",
  preference: {},
  language: "ko" as const,
};

describe("pickUpcomingPreviewQuotes", () => {
  it("내일부터 연속된 ymd 로 기본 7건을 돌려준다", () => {
    const out = pickUpcomingPreviewQuotes(BASE);
    expect(out).toHaveLength(UPCOMING_PREVIEW_DAYS);
    out.forEach((q, i) => {
      expect(q.ymd).toBe(addKstDays(BASE.startYmd, i + 1));
      expect(q.text.length).toBeGreaterThan(0);
      expect(q.author.length).toBeGreaterThan(0);
    });
  });

  it("결정론 — 같은 입력이면 언제 호출해도 같은 결과", () => {
    expect(pickUpcomingPreviewQuotes(BASE)).toEqual(pickUpcomingPreviewQuotes(BASE));
  });

  it("7일치가 서로 다른 명언이다(하루하루 exclude 누적)", () => {
    const texts = pickUpcomingPreviewQuotes(BASE).map((q) => q.text);
    expect(new Set(texts).size).toBe(texts.length);
  });

  it("excludeTexts 로 넘긴 명언(오늘 카드·과거 노출)은 다시 나오지 않는다", () => {
    const excluded = pickUpcomingPreviewQuotes(BASE).map((q) => q.text);
    const second = pickUpcomingPreviewQuotes({ ...BASE, excludeTexts: excluded });
    second.forEach((q) => expect(excluded).not.toContain(q.text));
  });

  it("startYmd 형식이 깨지면 빈 배열(위젯 응답에서 필드 생략)", () => {
    expect(pickUpcomingPreviewQuotes({ ...BASE, startYmd: "2026-13-99" })).toEqual([]);
  });

  it("사용자가 다르면 다른 회전(주간 인물 풀 시드가 uid 에 묶임)", () => {
    const a = pickUpcomingPreviewQuotes(BASE).map((q) => q.text).join("|");
    const b = pickUpcomingPreviewQuotes({ ...BASE, uid: "user-2" }).map((q) => q.text).join("|");
    expect(a).not.toBe(b);
  });
});
