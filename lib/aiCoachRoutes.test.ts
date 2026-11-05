import { afterEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET as usage, POST as ask } from "@/app/api/coach/chat/route";
import { QuotaExceededError } from "./quota";
import { COACH_PROFILE_CONSENT_VERSION } from "./aiCoachTypes";

const mocks = vi.hoisted(() => ({
  verifyRequestUser: vi.fn(),
  enforceQuota: vi.fn(),
  reply: vi.fn(),
  db: vi.fn(),
}));
vi.mock("@/lib/authServer", async (importOriginal) => ({
  ...await importOriginal<typeof import("./authServer")>(),
  verifyRequestUser: mocks.verifyRequestUser,
}));
vi.mock("@/lib/quota", async (importOriginal) => ({
  ...await importOriginal<typeof import("./quota")>(),
  enforceQuota: mocks.enforceQuota,
}));
vi.mock("@/lib/aiCoach", async (importOriginal) => ({
  ...await importOriginal<typeof import("./aiCoach")>(),
  replyToCoachQuestion: mocks.reply,
}));
vi.mock("@/lib/firebase-admin", () => ({ getAdminDb: mocks.db }));
afterEach(() => vi.resetAllMocks());

const url = "https://example.test/api/coach/chat";
const chat = (consent: boolean) => new NextRequest(url, {
  method: "POST",
  body: JSON.stringify({ question: "독서를 시작하려면?", consent }),
});

it("accepts three questions during a trial and rejects a fourth before calling AI", async () => {
  mocks.verifyRequestUser.mockResolvedValue({ uid: "user", entitlement: { kind: "trial", trialEndsAt: Date.now() + 60_000 } });
  mocks.reply.mockResolvedValue({ kind: "answer", text: "한 페이지부터 읽어보세요." });
  for (const used of [1, 2, 3]) {
    mocks.enforceQuota.mockResolvedValueOnce({ used, ymd: "2026-11-05" });
    const response = await ask(chat(true));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ usage: { limit: 3, remaining: 3 - used } });
  }
  mocks.enforceQuota.mockRejectedValueOnce(new QuotaExceededError("coachQuestion", 3, 3, "2026-11-05"));
  const response = await ask(chat(true));
  expect(response.status).toBe(429);
  expect(await response.json()).toMatchObject({ usage: { ymd: "2026-11-05", remaining: 0 } });
  expect(mocks.reply).toHaveBeenCalledTimes(3);
  expect(mocks.enforceQuota).toHaveBeenCalledWith("user", "coachQuestion");
  expect(mocks.db).not.toHaveBeenCalled();
});

it("reads only the signed-in user's saved profile after receiving the expanded consent", async () => {
  mocks.verifyRequestUser.mockResolvedValue({ uid: "actual-user", entitlement: { kind: "lifetime", platform: "ios" } });
  mocks.enforceQuota.mockResolvedValue({ used: 1, ymd: "2026-11-05" });
  mocks.reply.mockResolvedValue({ kind: "answer", text: "저녁에 책을 10분 읽어보세요." });
  const doc = vi.fn().mockReturnValue({
    get: async () => ({ data: () => ({ futureSelfAnswers: { daily: "조용히 독서하는 저녁" }, goals: ["매일 10분 독서"] }) }),
  });
  mocks.db.mockReturnValue({ doc });
  const response = await ask(new NextRequest(url, {
    method: "POST",
    body: JSON.stringify({
      question: "오늘 무엇부터 할까요?",
      consent: true,
      profileConsentVersion: COACH_PROFILE_CONSENT_VERSION,
      uid: "another-user",
      profile: { idealDay: "클라이언트가 보내는 다른 데이터" },
    }),
  }));

  expect(response.status).toBe(200);
  expect(doc).toHaveBeenCalledExactlyOnceWith("users/actual-user");
  expect(mocks.reply).toHaveBeenCalledWith("actual-user", expect.anything(), "ko", {
    idealDay: "조용히 독서하는 저녁",
    goals: ["매일 10분 독서"],
  });
});

it("rejects users without trial or Pro access before reading or counting usage", async () => {
  mocks.verifyRequestUser.mockResolvedValue({ uid: "user", entitlement: { kind: "free" } });
  expect((await usage(new NextRequest(url))).status).toBe(402);
  expect((await ask(chat(true))).status).toBe(402);
  expect(mocks.db).not.toHaveBeenCalled();
  expect(mocks.enforceQuota).not.toHaveBeenCalled();
});

it.each(["ios", "android"])("requires AI sharing consent from a paid %s user", async (platform) => {
  mocks.verifyRequestUser.mockResolvedValue({ uid: "user", entitlement: { kind: "lifetime", platform } });
  expect((await ask(chat(false))).status).toBe(400);
  expect(mocks.enforceQuota).not.toHaveBeenCalled();
  expect(mocks.reply).not.toHaveBeenCalled();
});
