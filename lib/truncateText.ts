/**
 * 사용자 텍스트를 표시 한계에 맞춰 "…" 로 마감하는 공용 헬퍼 — 순수 함수.
 *
 * 같은 규칙이 알림 제목(lib/notificationContent), 위젯 비전 티저(app/api/widget/today),
 * 정체성 증거 상세(lib/identityEvidence) 세 곳에 각각 복붙돼 있었다. 셋 다 아래의
 * 서로게이트 페어 문제를 그대로 안고 있어, 한 곳을 고쳐도 나머지는 계속 깨진 글자를 내보냈다.
 */

/**
 * 서로게이트 페어를 쪼개지 않고 자른다.
 *
 * `String.prototype.slice` 는 UTF-16 코드 유닛 단위라 이모지(😀 등 BMP 밖 문자)나
 * 결합 문자의 한가운데를 자를 수 있고, 그러면 잠금화면에 깨진 글자(�)가 그대로 뜬다.
 * `Array.from` 은 코드 포인트 단위로 순회하므로 글자가 쪼개지지 않는다.
 *
 * @param max 최대 글자 수(코드 포인트 기준). 넘지 않으면 trim 만 해서 그대로 돌려준다.
 */
export function truncateText(text: string, max: number): string {
  const trimmed = text.trim();
  const chars = Array.from(trimmed);
  if (chars.length <= max) return trimmed;
  return `${chars.slice(0, max).join("").trimEnd()}…`;
}
