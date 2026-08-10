/**
 * 계정 삭제 범위 회귀 테스트.
 *
 * 실제 사고: users/{uid} 아래 futureVisions / executionPlans / identityEvidence 가
 * 나중에 추가됐는데 삭제 라우트의 목록에는 반영되지 않아, 탈퇴한 사용자의 일별 기록이
 * 그대로 남았다. firestore.rules 는 deny-by-default 라 "클라이언트가 접근하는 모든
 * 서브컬렉션"이 반드시 룰에 선언돼 있다 — 그 선언을 삭제 범위의 기준으로 삼는다.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { USER_SUBCOLLECTIONS } from "@/lib/constants/userData";

const RULES_PATH = fileURLToPath(new URL("../../firestore.rules", import.meta.url));
const USER_BLOCK_HEADER = "match /users/{uid} {";

/**
 * firestore.rules 의 `match /users/{uid} { ... }` 블록 안에 선언된 서브컬렉션 이름을 뽑는다.
 * 중괄호 깊이를 세어 블록 끝을 찾으므로, 뒤에 오는 최상위 컬렉션(entitlements 등)은 섞이지 않는다.
 */
function userSubcollectionsFromRules(rules: string): string[] {
  const headerStart = rules.indexOf(USER_BLOCK_HEADER);
  if (headerStart < 0) {
    throw new Error(`firestore.rules 에서 "${USER_BLOCK_HEADER}" 블록을 찾지 못했습니다.`);
  }

  // 헤더의 마지막 문자가 여는 중괄호 — 여기서부터 깊이를 센다.
  // (헤더 안의 {uid} 는 이미 지나쳤으므로 깊이 계산에 끼어들지 않는다.)
  const blockStart = headerStart + USER_BLOCK_HEADER.length - 1;
  let depth = 0;
  let blockEnd = -1;
  for (let i = blockStart; i < rules.length; i++) {
    const ch = rules[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        blockEnd = i;
        break;
      }
    }
  }
  if (blockEnd < 0) throw new Error("users/{uid} 블록의 닫는 중괄호를 찾지 못했습니다.");

  const body = rules.slice(blockStart + 1, blockEnd);
  return [...body.matchAll(/match\s+\/(\w+)\/\{/g)].map((m) => m[1]);
}

describe("USER_SUBCOLLECTIONS (계정 삭제 범위)", () => {
  const declared = userSubcollectionsFromRules(readFileSync(RULES_PATH, "utf8"));

  it("firestore.rules 파싱이 실제로 서브컬렉션을 찾아낸다 (파서 자체 가드)", () => {
    // 파싱이 조용히 빈 배열을 돌려주면 아래 대조 테스트가 무의미하게 통과한다.
    expect(declared.length).toBeGreaterThanOrEqual(5);
    expect(declared).toContain("dailyEntries");
  });

  it("룰에 선언된 서브컬렉션이 모두 삭제 대상에 들어 있다", () => {
    const missing = declared.filter(
      (name) => !(USER_SUBCOLLECTIONS as readonly string[]).includes(name),
    );
    expect(
      missing,
      `firestore.rules 에는 있으나 삭제 목록에 없는 서브컬렉션: ${missing.join(", ")} ` +
        "— lib/constants/userData.ts 에 추가할 것.",
    ).toEqual([]);
  });

  it("삭제 목록에 룰에 없는 유령 컬렉션이 없다", () => {
    const unknown = USER_SUBCOLLECTIONS.filter((name) => !declared.includes(name));
    expect(
      unknown,
      `삭제 목록에만 있고 firestore.rules 에는 없는 이름: ${unknown.join(", ")}`,
    ).toEqual([]);
  });

  it("중복 항목이 없다", () => {
    expect(new Set(USER_SUBCOLLECTIONS).size).toBe(USER_SUBCOLLECTIONS.length);
  });
});
