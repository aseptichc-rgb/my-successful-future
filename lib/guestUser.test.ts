import { describe, expect, it } from "vitest";
import { isGuestUser } from "./guestUser";

const provider = (providerId: string) => ({ providerId });

describe("isGuestUser", () => {
  it("로그인 전(null/undefined)은 게스트가 아니다", () => {
    expect(isGuestUser(null)).toBe(false);
    expect(isGuestUser(undefined)).toBe(false);
  });

  it("익명 세션은 게스트", () => {
    expect(isGuestUser({ isAnonymous: true, providerData: [] })).toBe(true);
  });

  it("customToken 재로그인으로 isAnonymous 가 false 여도 로그인 수단이 없으면 게스트", () => {
    expect(isGuestUser({ isAnonymous: false, providerData: [] })).toBe(true);
  });

  it("로그인 수단이 하나라도 붙어 있으면 게스트가 아니다", () => {
    expect(isGuestUser({ isAnonymous: false, providerData: [provider("password")] })).toBe(false);
    expect(isGuestUser({ isAnonymous: false, providerData: [provider("google.com")] })).toBe(false);
    expect(isGuestUser({ isAnonymous: false, providerData: [provider("apple.com")] })).toBe(false);
  });
});
