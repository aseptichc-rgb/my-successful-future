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

/**
 * 형식·달력 양쪽으로 유효한 YYYY-MM-DD 인가.
 *
 * Date 파싱은 관대해서 "2026-13-99" 를 다음 해로 굴려 버린다 — 그대로 두면 깨진 날짜가
 * 조용히 **다른 날의 결과**를 내놓는다(요일 회전·해시 시드가 어긋나는 조용한 회귀).
 * 그래서 정규식 + 왕복 검증을 함께 한다.
 *
 * ⚠️ admin 무의존 모듈에 둔다 — lib/dailyMotivation.ts 는 firebase-admin 을 끌고 오므로
 *    클라이언트/순수 정책 모듈에서 import 할 수 없다(같은 파일이 이걸 re-export 한다).
 */
export function isValidYmd(ymd: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return false;
  // 형식뿐 아니라 실존하는 달력 날짜인지 확인 (9999-13-99, 2026-02-30 등 차단).
  const [y, m, d] = ymd.split("-").map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/**
 * 외부에서 넘어온 ymd(위젯 qDate 딥링크·API 요청 본문)를 [어제, 오늘] 창으로 제한한다.
 * 창 밖(더 과거·미래)이거나 형식이 깨졌으면 today 로 폴백.
 *
 * 왜 어제까지만: 위젯↔홈 일치 키(qDate)가 정당한 경우는 "자정 직후 위젯이 아직 어제 카드를
 * 그리고 있는" 한 가지뿐이다. 그보다 오래된 값은 stale 캐시·동기 갱신 타임아웃 폴백의 산물이라
 * 홈 전체(날짜·체크인·목표·리듬 링)를 며칠 전에 고정해 버린다 — 2026-08-27 실사고
 * (22일 카드를 그리던 위젯 탭 → /home?qDate=2026-08-22 → 홈이 5일 전에 고정).
 * 서버 resolveRequestYmd(쿼터 우회 차단)와 웹 useResolvedYmd 가 이 한 구현을 공유한다.
 */
export function clampYmdToRecent(ymd: string | null | undefined, today: string): string {
  if (!ymd || !isValidYmd(ymd)) return today;
  if (ymd === today || ymd === yesterdayKstYmd(today)) return ymd;
  return today;
}
