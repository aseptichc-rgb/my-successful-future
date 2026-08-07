import { describe, expect, it } from "vitest";
import { compareBuildNumbers, validateBuildForVersion } from "./ios-appstore-submit.mjs";

/**
 * 2026-08-06 실사고 회귀 테스트.
 *
 * 앱 버전 1.0.2 에 마케팅 버전 1.0 / 빌드번호 8 인 구 빌드를 붙여 제출했더니 ASC API 는
 * 200 으로 받아줬지만, Apple 사후 검증이 몇 분 뒤 INVALID_BINARY("잘못된 바이너리")로 반려했다.
 * API 가 막아주지 않으므로 제출 전에 우리가 막아야 한다.
 */
describe("compareBuildNumbers", () => {
  it("정수 빌드번호를 숫자로 비교한다 (문자열 비교면 '8' > '10' 이 되어 사고가 난다)", () => {
    expect(compareBuildNumbers("8", "10")).toBeLessThan(0);
    expect(compareBuildNumbers("10", "8")).toBeGreaterThan(0);
    expect(compareBuildNumbers("10", "10")).toBe(0);
  });

  it("점으로 구분된 빌드번호도 자리별로 비교한다", () => {
    expect(compareBuildNumbers("1.2.3", "1.10.0")).toBeLessThan(0);
    expect(compareBuildNumbers("2.0", "1.9.9")).toBeGreaterThan(0);
    expect(compareBuildNumbers("1.0", "1.0.0")).toBe(0);
  });

  it("숫자가 아닌 값은 0 으로 취급해 비교가 터지지 않는다", () => {
    expect(compareBuildNumbers("", "1")).toBeLessThan(0);
    expect(compareBuildNumbers(undefined, undefined)).toBe(0);
  });
});

describe("validateBuildForVersion", () => {
  it("마케팅 버전이 앱스토어 버전과 다르면 거부한다 — 실사고 재현", () => {
    const result = validateBuildForVersion({
      build: { buildNumber: "8", marketingVersion: "1.0" },
      versionString: "1.0.2",
      releasedBuildNumbers: ["10", "9"],
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("1.0");
    expect(result.reason).toContain("1.0.2");
  });

  it("빌드번호가 이미 출시된 빌드보다 낮으면 거부한다", () => {
    const result = validateBuildForVersion({
      build: { buildNumber: "8", marketingVersion: "1.0.2" },
      versionString: "1.0.2",
      releasedBuildNumbers: ["10", "9"],
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("10");
  });

  it("빌드번호가 이미 출시된 것과 같아도 거부한다 (재사용은 409)", () => {
    expect(
      validateBuildForVersion({
        build: { buildNumber: "10", marketingVersion: "1.0.2" },
        versionString: "1.0.2",
        releasedBuildNumbers: ["10"],
      }).ok,
    ).toBe(false);
  });

  it("마케팅 버전이 일치하고 빌드번호가 더 높으면 통과한다", () => {
    expect(
      validateBuildForVersion({
        build: { buildNumber: "11", marketingVersion: "1.0.2" },
        versionString: "1.0.2",
        releasedBuildNumbers: ["10", "9"],
      }),
    ).toEqual({ ok: true });
  });

  it("출시 이력이 없는 첫 제출이면 빌드번호 비교를 건너뛴다", () => {
    expect(
      validateBuildForVersion({
        build: { buildNumber: "1", marketingVersion: "1.0" },
        versionString: "1.0",
        releasedBuildNumbers: [],
      }),
    ).toEqual({ ok: true });
  });

  it("마케팅 버전을 읽지 못한 경우(?)에는 막지 않는다 — 조회 실패로 제출을 못 하게 두지 않는다", () => {
    expect(
      validateBuildForVersion({
        build: { buildNumber: "11", marketingVersion: "?" },
        versionString: "1.0.2",
        releasedBuildNumbers: ["10"],
      }),
    ).toEqual({ ok: true });
  });
});
