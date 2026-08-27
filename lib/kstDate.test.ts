import { describe, expect, it } from "vitest";
import { clampYmdToRecent } from "@/lib/kstDate";

/**
 * qDate(위젯↔홈 일치 키)·요청 ymd 의 신선도 상한 — 서버 resolveRequestYmd 와 웹 useResolvedYmd 가
 * 같은 정책을 공유해야 한다. 2026-08-27 실사고: 22일 카드를 그리던 stale 위젯 탭 →
 * /home?qDate=2026-08-22 → 홈 전체(날짜·체크인·목표)가 5일 전에 고정됐다.
 */
describe("clampYmdToRecent", () => {
  const today = "2026-08-27";

  it("오늘이면 그대로", () => {
    expect(clampYmdToRecent("2026-08-27", today)).toBe("2026-08-27");
  });

  it("어제는 허용 — 자정 직후 위젯이 어제 카드를 그리고 있는 정상 케이스", () => {
    expect(clampYmdToRecent("2026-08-26", today)).toBe("2026-08-26");
  });

  it("월 경계에서도 어제를 올바르게 계산한다", () => {
    expect(clampYmdToRecent("2026-08-31", "2026-09-01")).toBe("2026-08-31");
  });

  it("실사고 재현: 5일 전 qDate 는 오늘로 폴백", () => {
    expect(clampYmdToRecent("2026-08-22", today)).toBe("2026-08-27");
  });

  it("이틀 전부터는 stale — 오늘로 폴백", () => {
    expect(clampYmdToRecent("2026-08-25", today)).toBe("2026-08-27");
  });

  it("미래 날짜는 오늘로 폴백", () => {
    expect(clampYmdToRecent("2026-08-28", today)).toBe("2026-08-27");
    expect(clampYmdToRecent("2027-01-01", today)).toBe("2026-08-27");
  });

  it("형식 오류·달력에 없는 날짜·빈 값은 오늘로 폴백", () => {
    expect(clampYmdToRecent(null, today)).toBe(today);
    expect(clampYmdToRecent(undefined, today)).toBe(today);
    expect(clampYmdToRecent("", today)).toBe(today);
    expect(clampYmdToRecent("2026-8-27", today)).toBe(today);
    expect(clampYmdToRecent("2026-02-30", today)).toBe(today);
    expect(clampYmdToRecent("<script>", today)).toBe(today);
  });
});
