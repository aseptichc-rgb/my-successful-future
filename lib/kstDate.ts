/**
 * KST(한국 표준시, UTC+9) 날짜 유틸 — 위젯·카드·체크인·쿼터가 공유하는 단일 진리원천.
 *
 * 오프셋/경계 로직이 파일마다 복제돼 있으면 한 곳만 고쳤을 때 날짜 경계가 어긋나
 * 스트릭/쿼터가 하루 밀리는 회귀가 난다. 여기로 통합한다.
 */
export const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** KST 기준 YYYY-MM-DD. 인자를 주면 그 시각 기준, 없으면 현재. */
export function todayKstYmd(date: Date = new Date()): string {
  return new Date(date.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

/** 주어진 YYYY-MM-DD 의 하루 전 YYYY-MM-DD. */
export function yesterdayKstYmd(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
}
