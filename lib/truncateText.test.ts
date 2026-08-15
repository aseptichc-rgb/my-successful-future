import { describe, expect, it } from "vitest";
import { truncateText } from "@/lib/truncateText";

describe("truncateText", () => {
  it("한계 이내면 trim 만 하고 그대로 돌려준다", () => {
    expect(truncateText("  안녕하세요  ", 10)).toBe("안녕하세요");
  });

  it("정확히 한계 길이면 자르지 않는다 (off-by-one 방어)", () => {
    expect(truncateText("12345", 5)).toBe("12345");
  });

  it("한계를 넘으면 … 로 마감한다", () => {
    expect(truncateText("123456", 5)).toBe("12345…");
  });

  it("자른 끝의 공백은 … 앞에서 제거한다", () => {
    expect(truncateText("가나다 라마바", 4)).toBe("가나다…");
  });

  it("이모지를 반쪽으로 쪼개지 않는다 — 잠금화면에 깨진 글자(�)가 뜨면 안 된다", () => {
    // 😀 는 UTF-16 코드 유닛 2개짜리라 slice() 기반 구현은 경계에서 반쪽을 남겼다.
    const text = "😀😀😀😀";
    expect(truncateText(text, 2)).toBe("😀😀…");

    // 짝 잃은 서로게이트가 남지 않았는지 확인.
    // (정상 페어는 codePointAt 이 0x1F600 이고, 고아 서로게이트만 0xD800~0xDFFF 에 남는다.
    //  문자열 전체에 /[\uD800-\uDFFF]/ 를 걸면 멀쩡한 이모지도 걸리므로 코드 포인트로 봐야 한다.)
    for (let max = 1; max <= 4; max++) {
      const out = truncateText(text, max);
      for (const ch of out) {
        const cp = ch.codePointAt(0) ?? 0;
        expect(cp < 0xd800 || cp > 0xdfff).toBe(true);
      }
    }

    // 옛 구현(slice 기반)은 같은 입력에서 실제로 고아 서로게이트를 남겼다 — 회귀 방지의 근거.
    const legacy = text.slice(0, 3);
    expect((legacy.codePointAt(2) ?? 0) >= 0xd800).toBe(true);
  });

  it("한계는 코드 포인트 기준이다 — 이모지 1개는 1글자로 센다", () => {
    // UTF-16 길이는 8 이지만 코드 포인트는 4 이므로 자르지 않는다.
    expect(truncateText("😀😀😀😀", 4)).toBe("😀😀😀😀");
  });

  it("빈 문자열·공백만 있는 입력에도 터지지 않는다", () => {
    expect(truncateText("", 5)).toBe("");
    expect(truncateText("   ", 5)).toBe("");
  });
});
