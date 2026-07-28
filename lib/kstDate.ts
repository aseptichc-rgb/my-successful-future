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

const DAY_MS = 24 * 60 * 60 * 1000;

/** YYYY-MM-DD → UTC 자정 epoch(ms). 형식이 깨졌으면 NaN. */
function ymdToUtcMs(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return NaN;
  return Date.UTC(y, m - 1, d);
}

/**
 * a → b 경과 일수 (둘 다 KST YYYY-MM-DD). b 가 미래면 양수, 같은 날이면 0.
 * 스트릭 gap 판정("며칠 놓쳤나")과 재약속 카드의 클라 측 감지가 공유하는 단일 계산.
 * 어느 한쪽이라도 형식이 깨졌으면 NaN — 호출부는 Number.isFinite 로 방어할 것.
 */
export function diffKstDays(a: string, b: string): number {
  const am = ymdToUtcMs(a);
  const bm = ymdToUtcMs(b);
  if (Number.isNaN(am) || Number.isNaN(bm)) return NaN;
  return Math.round((bm - am) / DAY_MS);
}

/** 주어진 YYYY-MM-DD 에 delta 일을 더한 YYYY-MM-DD (음수 허용) — 히트맵 범위 계산용. */
export function addKstDays(ymd: string, delta: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10);
}

/** KST YYYY-MM (스트릭 프리즈 월 리필 키). */
export function kstMonth(ymd: string): string {
  return ymd.slice(0, 7);
}

/** 현재 KST 시(0-23) — 홈 아침/저녁 모드 판정용. */
export function kstHour(date: Date = new Date()): number {
  return new Date(date.getTime() + KST_OFFSET_MS).getUTCHours();
}

/**
 * 주어진 KST YYYY-MM-DD 의 요일 (0=일요일 … 6=토요일) — 주간 회고 카드 노출 판정용.
 * ymd 는 이미 KST 로 환산된 날짜이므로 UTC 자정으로 파싱해도 요일이 어긋나지 않는다.
 * 형식이 깨졌으면 -1 (호출부는 === 0 비교만 하므로 자연히 미노출).
 */
export function kstWeekday(ymd: string): number {
  const ms = ymdToUtcMs(ymd);
  return Number.isNaN(ms) ? -1 : new Date(ms).getUTCDay();
}
