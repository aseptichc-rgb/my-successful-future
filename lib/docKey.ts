/**
 * 스냅샷/조회 결과가 "지금 화면의 계정·날짜" 것인지 판정하는 키.
 *
 * 결과를 이 키와 함께 저장해 두면 계정·날짜가 바뀌는 순간 파생값이 저절로
 * "로딩 전" 상태가 되므로, 효과 본문에서 초기화 setState 를 부를 필요가 없다.
 * 오늘 탭·기록 탭·공유 컨텍스트(lib/today-context)가 같은 규칙을 쓴다.
 */
export function docKey(uid: string | undefined, ymd: string): string {
  return `${uid ?? ""}:${ymd}`;
}
