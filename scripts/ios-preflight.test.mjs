import { describe, expect, it } from "vitest";
import { readBuildSetting } from "./ios-preflight.mjs";

/**
 * pbxproj 파싱 테스트.
 *
 * Windows 에는 ios/ 디렉터리가 없어 실물로 확인할 수 없으므로, Xcode 가 실제로 쓰는 문법을
 * 그대로 옮긴 표본으로 검증한다. 프리플라이트가 맥에서 엉뚱한 값을 보여주면 오히려 사고를
 * 유도하므로, 이 파싱만큼은 여기서 확실히 잡아 둔다.
 */
const SAMPLE = `
/* Begin XCBuildConfiguration section */
		504EC3081FED79650016851F /* Debug */ = {
			isa = XCBuildConfiguration;
			buildSettings = {
				CURRENT_PROJECT_VERSION = 11;
				MARKETING_VERSION = 1.0.2;
				PRODUCT_BUNDLE_IDENTIFIER = com.michaelkim.anima;
				INFOPLIST_KEY_CFBundleDisplayName = "Anima Daily";
			};
			name = Debug;
		};
		504EC3091FED79650016851F /* Release */ = {
			isa = XCBuildConfiguration;
			buildSettings = {
				CURRENT_PROJECT_VERSION = 11;
				MARKETING_VERSION = 1.0.2;
			};
			name = Release;
		};
`;

describe("readBuildSetting", () => {
  it("MARKETING_VERSION 을 읽는다", () => {
    expect(readBuildSetting(SAMPLE, "MARKETING_VERSION")).toEqual(["1.0.2"]);
  });

  it("CURRENT_PROJECT_VERSION 을 읽는다", () => {
    expect(readBuildSetting(SAMPLE, "CURRENT_PROJECT_VERSION")).toEqual(["11"]);
  });

  it("Debug/Release 에 같은 값이 중복돼도 하나로 합친다", () => {
    expect(readBuildSetting(SAMPLE, "MARKETING_VERSION")).toHaveLength(1);
  });

  it("타깃마다 값이 다르면 전부 보여준다 (앱/위젯 불일치를 눈에 띄게)", () => {
    const mixed = `${SAMPLE}\n\t\t\t\tMARKETING_VERSION = 1.0.1;\n`;
    expect(readBuildSetting(mixed, "MARKETING_VERSION")).toEqual(["1.0.2", "1.0.1"]);
  });

  it("따옴표로 감싼 값은 따옴표를 벗긴다", () => {
    expect(readBuildSetting(SAMPLE, "INFOPLIST_KEY_CFBundleDisplayName")).toEqual(["Anima Daily"]);
  });

  it("없는 키는 빈 배열", () => {
    expect(readBuildSetting(SAMPLE, "NOT_A_REAL_SETTING")).toEqual([]);
  });

  it("접두어가 같은 다른 키를 잘못 잡지 않는다", () => {
    const src = "\t\t\t\tMARKETING_VERSION_SUFFIX = zzz;\n\t\t\t\tMARKETING_VERSION = 2.0;\n";
    expect(readBuildSetting(src, "MARKETING_VERSION")).toEqual(["2.0"]);
  });
});
