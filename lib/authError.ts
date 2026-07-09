import { FirebaseError } from "firebase/app";
import type { DictKey } from "@/lib/i18n";

/**
 * Firebase Auth 오류 → 사용자 안내 문구(i18n 키) 매핑.
 *
 * 배경: 가입/로그인 페이지가 모든 예외를 삼키고 "다시 시도해주세요." 만 노출해,
 * 이미 가입된 이메일로 재가입을 시도하는 사용자가 원인도 모른 채 영영 막히는
 * 문제가 있었다(auth/email-already-in-use). 코드별로 행동 가능한 문구를 준다.
 */

/** 사용자가 OAuth 팝업/시트를 스스로 닫은 경우 — 오류가 아니므로 문구를 띄우지 않는다. */
const CANCELLED_CODES: ReadonlySet<string> = new Set([
  "auth/popup-closed-by-user",
  "auth/cancelled-popup-request",
  "auth/user-cancelled",
]);

const CODE_TO_MESSAGE_KEY: Readonly<Record<string, DictKey>> = {
  "auth/email-already-in-use": "auth.error.emailInUse",
  "auth/invalid-email": "auth.error.invalidEmail",
  "auth/weak-password": "auth.error.invalidPassword",
  "auth/password-does-not-meet-requirements": "auth.error.invalidPassword",
  // 로그인 실패 3종 — enumeration protection 환경에선 invalid-credential 로 통합돼 온다.
  "auth/invalid-credential": "auth.error.invalidCredentials",
  "auth/wrong-password": "auth.error.invalidCredentials",
  "auth/user-not-found": "auth.error.invalidCredentials",
  "auth/too-many-requests": "auth.error.tooManyRequests",
  "auth/network-request-failed": "auth.error.network",
};

/**
 * 오류를 i18n 메시지 키로 정규화한다.
 * @returns 안내 문구 키. 사용자가 스스로 취소한 경우(팝업 닫기)는 null — 문구 없이 화면 유지.
 */
export function authErrorMessageKey(err: unknown): DictKey | null {
  if (err instanceof FirebaseError) {
    if (CANCELLED_CODES.has(err.code)) return null;
    return CODE_TO_MESSAGE_KEY[err.code] ?? "auth.error.generic";
  }
  return "auth.error.generic";
}
