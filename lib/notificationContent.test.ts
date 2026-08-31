/**
 * 알림 문구 조립(buildNotificationContent) — morningUpcoming(미래 아침 문구) 단위 테스트.
 *
 * morningUpcoming 은 "앱을 안 열어도 아침 푸시에 그날의 명언이 실린다" 기능의 재료다.
 * 오늘 문구와 같은 조립 규칙(트렁케이트·fullText·author 본문)을 공유하는지가 핵심 —
 * 깨지면 미래 날짜 알림만 조용히 빈 제목/어제 문구로 나간다.
 */
import { describe, it, expect } from "vitest";
import { buildNotificationContent } from "@/lib/notificationContent";

const LONG_QUOTE = "가".repeat(60);

function build(extra: Partial<Parameters<typeof buildNotificationContent>[0]> = {}) {
  return buildNotificationContent({
    locale: "ko",
    uid: "u1",
    ymd: "2026-08-31",
    quote: "멈추지만 않는다면, 얼마나 천천히 가는가는 중요하지 않다.",
    author: "공자",
    pendingTaskEnabled: false,
    ...extra,
  });
}

describe("buildNotificationContent — morningUpcoming", () => {
  it("upcoming 이 없으면 morningUpcoming 도 없다(옛 클라이언트 호환)", () => {
    expect(build().morningUpcoming).toBeUndefined();
  });

  it("upcoming 미리보기가 날짜별 아침 문구로 조립된다", () => {
    const out = build({
      upcoming: [
        { ymd: "2026-09-01", text: "내일의 한 마디", author: "테스트" },
        { ymd: "2026-09-02", text: LONG_QUOTE, author: "" },
      ],
    });
    const up = out.morningUpcoming;
    expect(up && Object.keys(up).sort()).toEqual(["2026-09-01", "2026-09-02"]);
    expect(up?.["2026-09-01"]?.title).toBe("내일의 한 마디");
    expect(up?.["2026-09-01"]?.body).toContain("테스트");
    // 긴 명언은 오늘 문구와 같은 규칙으로 잘리고 전문이 fullText 로 실린다.
    expect(up?.["2026-09-02"]?.title).not.toBe(LONG_QUOTE);
    expect(up?.["2026-09-02"]?.fullText).toBe(LONG_QUOTE);
  });

  it("빈 명언 미리보기는 건너뛴다 — 빈 제목 알림 방지", () => {
    const out = build({ upcoming: [{ ymd: "2026-09-01", text: "   ", author: "x" }] });
    expect(out.morningUpcoming).toBeUndefined();
  });

  it("오늘 아침 문구는 여전히 오늘 명언을 제목으로 싣는다", () => {
    const out = build();
    expect(out.morning.title).toBe("멈추지만 않는다면, 얼마나 천천히 가는가는 중요하지 않다.");
    expect(out.morning.body).toContain("공자");
  });
});
