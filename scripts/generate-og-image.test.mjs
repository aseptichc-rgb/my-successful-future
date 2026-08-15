import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { apertureSVG, buildHTML, markAccent } from "./generate-og-image.mjs";

/**
 * OG 이미지 생성기의 순수 함수 검증.
 *
 * 렌더 자체(Playwright)는 스크립트가 실행 중에 웹폰트·안전폭·파일 크기를 실측해 REJECT 로
 * 죽으므로 여기서 또 볼 필요가 없다. 여기서 지키는 것은 그 실측이 걸러내지 못하는 것들이다 —
 * 마크업이 조용히 비는 경우와, 이미지 카피가 <meta> 문구와 갈라지는 경우.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("markAccent", () => {
  it("강조어를 <em> 으로 감싼다", () => {
    expect(markAccent("오늘 할 한 걸음이 정해집니다", "한 걸음")).toBe(
      "오늘 할 <em>한 걸음</em>이 정해집니다",
    );
  });

  it("강조어가 없거나 줄에 없으면 원문을 그대로 둔다", () => {
    expect(markAccent("꿈을 한 줄 적으면", null)).toBe("꿈을 한 줄 적으면");
    expect(markAccent("꿈을 한 줄 적으면", "없는말")).toBe("꿈을 한 줄 적으면");
  });

  it("첫 한 번만 감싼다 — 금색 강조는 판 전체에 한 곳이다", () => {
    expect(markAccent("한 걸음, 또 한 걸음", "한 걸음")).toBe("<em>한 걸음</em>, 또 한 걸음");
  });
});

describe("apertureSVG", () => {
  it("요청한 크기와 색으로 조리개 마크를 만든다", () => {
    const svg = apertureSVG(34);
    expect(svg).toContain('width="34"');
    expect(svg).toContain('height="34"');
    expect(svg).toContain("#E7C77A"); // 링 — gold tint
    expect(svg).toContain("#D85A30"); // 가운데 점 — soul orange
    expect(svg).toMatch(/<path d="M [\d.]+ [\d.]+ A 42 42 0 1 1 [\d.]+ [\d.]+"/);
  });
});

describe("buildHTML", () => {
  const html = buildHTML();

  it("워드마크·헤드라인 두 줄·deck 이 모두 들어간다", () => {
    expect(html).toContain(">anima<");
    expect((html.match(/class="hl-line"/g) ?? []).length).toBe(2);
    expect(html).toContain('class="deck"');
  });

  it("금색 강조가 정확히 한 곳이다", () => {
    expect((html.match(/<em>/g) ?? []).length).toBe(1);
  });

  it("캔버스가 OG 권장 규격 1200×630 이다", () => {
    expect(html).toContain("width:1200px;height:630px");
  });

  it("보드와 같은 팔레트·배경을 쓴다", () => {
    expect(html).toContain("#F7F3EC"); // cream
    expect(html).toContain("#D9A441"); // gold
    expect(html).toContain("radial-gradient(120% 90% at 50% 0%,#26232E 0%,#16141A 46%,#0E0D12 100%)");
  });

  /**
   * 이미지 카피와 <meta> 문구가 갈라지면 스크래퍼 미리보기 안에서 썸네일과 설명이 서로 다른
   * 말을 한다. 사람이 한쪽만 고치기 쉬운 자리라 여기서 묶어 둔다.
   */
  it("헤드라인·deck 이 layout.tsx 의 description 안에 그대로 있다", () => {
    const layout = readFileSync(join(ROOT, "app", "layout.tsx"), "utf8");
    const description = layout.match(/const SITE_DESCRIPTION\s*=\s*\n?\s*"([^"]+)"/)?.[1];
    expect(description, "layout.tsx 의 SITE_DESCRIPTION 을 찾지 못했습니다").toBeTruthy();

    for (const phrase of ["꿈을 한 줄 적으면", "오늘 할 한 걸음이", "매일 도착합니다"]) {
      expect(description).toContain(phrase);
    }
  });
});
