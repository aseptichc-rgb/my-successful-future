/**
 * 사용자 데이터가 실제로 어디에 쌓이는지에 대한 단일 진리원천.
 *
 * 계정 삭제(/api/account/delete) 의 삭제 범위가 여기서 나온다. Firestore 는 상위 문서를
 * 지워도 서브컬렉션을 자동으로 지우지 않으므로, 목록에서 빠진 서브컬렉션은 탈퇴 후에도
 * 그대로 남는다 — [app/privacy/page.tsx] 의 "Retention" 조항(프로필·일별 기록 영구 삭제)
 * 위반이자 스토어 계정 삭제 정책 위반이다.
 *
 * ⚠️ users/{uid} 아래 새 서브컬렉션을 추가하면 **반드시 이 배열에도 추가**할 것.
 *    [lib/constants/userData.test.ts] 가 firestore.rules 의 match 블록과 이 배열을 대조해
 *    누락을 CI 에서 잡는다. 룰에 없는 서브컬렉션은 애초에 만들지 않는 게 원칙(deny-by-default).
 */
export const USER_SUBCOLLECTIONS = [
  /** 일일 체크리스트/회고 (문서 ID = YYYY-MM-DD KST). */
  "dailyEntries",
  /** 매일 동기부여 카드. */
  "dailyMotivations",
  /** "꿈이 이뤄진 하루" 미래 일상 비전. */
  "futureVisions",
  /** 일별 호출 한도 카운터. */
  "usage",
  /** 정체성 라벨별 누적 진행도. */
  "identityProgress",
  /** 다짐 따라쓰기 체크인 로그. */
  "affirmationLogs",
  /** WOOP 실행설계 (if-then) — 사용자가 직접 쓴 산문. */
  "executionPlans",
  /** 정체성 증거 장부 (일자별). */
  "identityEvidence",
] as const;

export type UserSubcollection = (typeof USER_SUBCOLLECTIONS)[number];
