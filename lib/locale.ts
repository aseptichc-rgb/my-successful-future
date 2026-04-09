// ── 로케일 및 타임존 중앙 설정 ────────────────────────
// 다른 언어/지역 지원 시 이 파일만 수정하면 됩니다.

export interface LocaleConfig {
  /** BCP 47 언어 태그 (e.g. "ko-KR", "en-US", "ja-JP") */
  locale: string;
  /** IANA 타임존 (e.g. "Asia/Seoul", "America/New_York") */
  timeZone: string;
  /** 표시용 타임존 이름 */
  timeZoneName: string;
}

const LOCALE_CONFIGS: Record<string, LocaleConfig> = {
  "ko-KR": {
    locale: "ko-KR",
    timeZone: "Asia/Seoul",
    timeZoneName: "대한민국 표준시 (KST)",
  },
  "en-US": {
    locale: "en-US",
    timeZone: "America/New_York",
    timeZoneName: "Eastern Time (ET)",
  },
  "ja-JP": {
    locale: "ja-JP",
    timeZone: "Asia/Tokyo",
    timeZoneName: "日本標準時 (JST)",
  },
};

// 현재 활성 로케일 — 언어 전환 시 이 값만 변경
let currentLocaleKey: string = "ko-KR";

export function getCurrentLocale(): LocaleConfig {
  return LOCALE_CONFIGS[currentLocaleKey] ?? LOCALE_CONFIGS["ko-KR"];
}

export function setCurrentLocale(key: string) {
  if (LOCALE_CONFIGS[key]) {
    currentLocaleKey = key;
  }
}

export function getAvailableLocales(): LocaleConfig[] {
  return Object.values(LOCALE_CONFIGS);
}

// ── 날짜/시간 포맷 유틸리티 ────────────────────────────

/** 날짜만 표시 (예: "2026. 4. 9.") */
export function formatDate(date: Date): string {
  const { locale, timeZone } = getCurrentLocale();
  return date.toLocaleDateString(locale, { timeZone });
}

/** 시간만 표시 (예: "오후 3:42") */
export function formatTime(date: Date): string {
  const { locale, timeZone } = getCurrentLocale();
  return date.toLocaleTimeString(locale, {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** 날짜+시간 표시 */
export function formatDateTime(date: Date): string {
  const { locale, timeZone } = getCurrentLocale();
  return date.toLocaleString(locale, { timeZone });
}

/** 짧은 날짜 (월, 일만) */
export function formatShortDate(date: Date): string {
  const { locale, timeZone } = getCurrentLocale();
  return date.toLocaleDateString(locale, {
    timeZone,
    month: "short",
    day: "numeric",
  });
}

/** 상대 시간 표시 (오늘/어제/N일 전/날짜) */
export function formatRelativeDate(date: Date): string {
  const { timeZone } = getCurrentLocale();
  const now = new Date();

  // 타임존 적용된 날짜 문자열로 비교
  const dateStr = date.toLocaleDateString("en-CA", { timeZone }); // YYYY-MM-DD
  const nowStr = now.toLocaleDateString("en-CA", { timeZone });

  if (dateStr === nowStr) {
    return formatTime(date);
  }

  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 1) return "어제";
  if (days < 7) return `${days}일 전`;

  return formatShortDate(date);
}
