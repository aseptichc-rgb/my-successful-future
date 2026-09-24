/**
 * 게스트(익명 계정) 판정 — 순수 함수.
 *
 * `user.isAnonymous` 만 보면 안 되는 이유: 체험 시작(/api/auth/start-trial)·결제 검증이 돌려주는
 * customToken 으로 같은 uid 에 재로그인하면 Firebase 는 그 세션을 익명이 아닌 것으로 표시한다
 * (isAnonymous=false). 계정에는 여전히 로그인 수단이 하나도 없는데도 게스트 안내 카드·계정 연결
 * 행이 사라지고 /signup 이 홈으로 튕겨 연결 자체가 불가능해진다.
 * providerData 는 계정에 붙은 로그인 수단(password·google.com·apple.com)이라 로그인 방식과
 * 무관하게 비어 있으면 익명 계정이다.
 */
export interface GuestCheckableUser {
  isAnonymous: boolean;
  providerData: ReadonlyArray<unknown>;
}

export function isGuestUser(user: GuestCheckableUser | null | undefined): boolean {
  if (!user) return false;
  return user.isAnonymous || user.providerData.length === 0;
}
