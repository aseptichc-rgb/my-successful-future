import { describe, expect, it } from "vitest";
import { ACQUISITION_MAX_ROWS, DIRECT_SOURCE, computeRetention, countAcquisition, countEvents } from "./retention";

describe("computeRetention", () => {
  const today = "2026-09-23";

  it("가입자가 없으면 분모 0 · rate null", () => {
    const r = computeRetention([], [], today);
    expect(r.d1).toEqual({ eligible: 0, returned: 0, rate: null });
    expect(r.d7).toEqual({ eligible: 0, returned: 0, rate: null });
  });

  it("D1 은 가입 다음 날 app_open 이 있어야 돌아온 것으로 센다", () => {
    const users = [
      { uid: "a", createdYmd: "2026-09-10" },
      { uid: "b", createdYmd: "2026-09-10" },
    ];
    const opens = [
      { uid: "a", day: "2026-09-11" }, // +1
      { uid: "b", day: "2026-09-12" }, // +2 — D1 아님
    ];
    const r = computeRetention(users, opens, today);
    expect(r.d1).toEqual({ eligible: 2, returned: 1, rate: 0.5 });
  });

  it("D7 은 7~13일째 창 안에 한 번이라도 열면 인정", () => {
    const users = [
      { uid: "a", createdYmd: "2026-09-01" },
      { uid: "b", createdYmd: "2026-09-01" },
      { uid: "c", createdYmd: "2026-09-01" },
    ];
    const opens = [
      { uid: "a", day: "2026-09-08" }, // +7
      { uid: "b", day: "2026-09-14" }, // +13
      { uid: "c", day: "2026-09-15" }, // +14 — 창 밖
      { uid: "c", day: "2026-09-02" }, // +1 — D1 만
    ];
    const r = computeRetention(users, opens, today);
    expect(r.d7).toEqual({ eligible: 3, returned: 2, rate: 2 / 3 });
    expect(r.d1.returned).toBe(1);
  });

  it("창이 아직 안 닫힌 신규 가입자는 분모에서 뺀다", () => {
    const users = [
      { uid: "fresh", createdYmd: "2026-09-23" }, // 오늘 가입 — D1·D7 둘 다 판정 불가
      { uid: "week", createdYmd: "2026-09-15" }, // 8일 전 — D1 가능, D7 불가
    ];
    const r = computeRetention(users, [], today);
    expect(r.d1.eligible).toBe(1);
    expect(r.d7.eligible).toBe(0);
  });
});

describe("countEvents", () => {
  const day = 24 * 60 * 60 * 1000;
  const now = Date.UTC(2026, 8, 23);

  it("이름별 7일/30일 건수와 고유 사용자 수를 names 순서로 돌려준다(0건 포함)", () => {
    const rows = [
      { uid: "a", name: "app_open", at: now - 1 * day },
      { uid: "a", name: "app_open", at: now - 2 * day },
      { uid: "b", name: "app_open", at: now - 10 * day },
      { uid: "b", name: "app_open", at: now - 40 * day }, // 30일 밖
      { uid: "z", name: "unknown", at: now }, // 목록에 없는 이름은 무시
    ];
    const out = countEvents(rows, ["app_open", "purchase_completed"], now);
    expect(out).toEqual([
      {
        name: "app_open",
        last7d: { count: 2, users: 1 },
        last30d: { count: 3, users: 2 },
      },
      {
        name: "purchase_completed",
        last7d: { count: 0, users: 0 },
        last30d: { count: 0, users: 0 },
      },
    ]);
  });
});

describe("countAcquisition", () => {
  const now = Date.UTC(2026, 8, 23);
  const day = 24 * 60 * 60 * 1000;

  it("utm_source × campaign 으로 묶고 같은 사람은 한 번만 센다", () => {
    const out = countAcquisition(
      [
        { uid: "a", at: now - day, source: "share", campaign: "streak_share" },
        { uid: "a", at: now - 2 * day, source: "share", campaign: "streak_share" }, // 중복
        { uid: "b", at: now - day, source: "share", campaign: "streak_share" },
        { uid: "c", at: now - day, source: "facebook", campaign: "anima_launch_kr" },
      ],
      now,
    );
    expect(out).toEqual([
      { source: "share", campaign: "streak_share", users: 2 },
      { source: "facebook", campaign: "anima_launch_kr", users: 1 },
    ]);
  });

  it("utm 이 없으면 direct, 30일 밖은 버린다", () => {
    const out = countAcquisition(
      [
        { uid: "a", at: now - day, source: null, campaign: null },
        { uid: "b", at: now - 40 * day, source: "facebook", campaign: null },
      ],
      now,
    );
    expect(out).toEqual([{ source: DIRECT_SOURCE, campaign: null, users: 1 }]);
  });

  it("행 수를 상한으로 자른다", () => {
    const rows = Array.from({ length: ACQUISITION_MAX_ROWS + 5 }, (_, i) => ({
      uid: `u${i}`,
      at: now - day,
      source: `s${i}`,
      campaign: null,
    }));
    expect(countAcquisition(rows, now)).toHaveLength(ACQUISITION_MAX_ROWS);
  });
});
