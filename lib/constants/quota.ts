/**
 * 결제 후 사용자에게도 일별 호출 한도를 둔다.
 * 1회 결제 모델에서 한 명이 무한 호출하면 백엔드 비용이 결제액을 빠르게 초과한다.
 *
 * 한도 단위는 KST 자정 기준 1일. enforceQuota() 가 호출 직전 트랜잭션으로 카운트한다.
 *
 * 변경 시 주의:
 * - 새 키를 추가하면 firestore 인덱스가 필요하지 않다 (단일 doc 안의 필드).
 * - 기존 한도를 *낮추면* 이미 호출 중이던 사용자가 갑자기 막힐 수 있으니 점진 롤아웃 권장.
 */
export const DAILY_QUOTA = {
  /** 동기부여 카드 신규 생성 (다시 받기 포함). 단순 캐시 조회는 카운트하지 않음. */
  motivationGenerate: 3,
  /** 위젯 새로고침 호출 (안드로이드 위젯의 폴링 + 수동 새로고침 모두 합산). */
  widgetRefresh: 48,
  /** 명언 작가 자유 발화 추천 (LLM 호출 1건 = 1카운트). */
  authorRecommend: 5,
  /**
   * 카드 미션에 적은 한 줄 응답 저장. 1카드당 최초 1회만 정체성 카운터 +1,
   * 그 이후엔 같은 카드 텍스트 수정도 이 한도를 차지해 도배를 막는다.
   */
  missionResponse: 5,
} as const;

export type QuotaKey = keyof typeof DAILY_QUOTA;

/**
 * 운영에서 true 로 켜면 결제 검증을 통과하지 못한 사용자의 보호 라우트 호출을 402 로 차단.
 * 개발/베타 단계에서는 false (기본값) — 결제 흐름이 완성되기 전 모든 라우트가 살아있도록.
 */
export const ENTITLEMENT_REQUIRED = process.env.ENTITLEMENT_REQUIRED === "true";
