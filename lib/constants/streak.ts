/**
 * 스트릭 프리즈 정책 상수 — 클라이언트 안전 모듈.
 *
 * 서버(lib/affirmationCheckin.ts 트랜잭션)와 클라(/progress 표시, 홈 재약속 카드의
 * gap 판정)가 같은 값을 봐야 한다. affirmationCheckin.ts 는 firebase-admin 을
 * import 하므로 클라 번들에 넣을 수 없어 상수만 여기로 분리했다.
 *
 * 근거: 하루 결석은 습관 형성에 유의한 손상이 없고(Lally 2010), 전량 리셋은
 * "에라 모르겠다 효과(what-the-hell effect)"로 이탈을 부른다 — 월 2회까지
 * 결석을 자동으로 다리 놓아 스트릭을 잇는다.
 */
export const FREEZES_PER_MONTH = 2;
