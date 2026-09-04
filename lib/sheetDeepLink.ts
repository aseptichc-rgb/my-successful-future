/**
 * 내 꿈 탭(/dream)의 시트 딥링크 — 순수 모듈.
 *
 * 미완 과업 넛지 알림·홈의 CTA 가 "탭 → 바로 그 편집 시트"가 되려면 시트가 URL 로 열려야
 * 한다. 값은 types/index.ts 의 NotificationTapTarget(`settings-*`) 과 1:1 대응이고, 옛 경로
 * `/settings?sheet=` 는 next.config redirects 가 `/dream?sheet=` 로 보낸다.
 *
 *   ?sheet=goals[&refine=1] — 목표 편집 (refine: 첫 줄의 구체성 힌트를 펼치고 포커스)
 *   ?sheet=affirmations     — 다짐 편집
 *   ?sheet=futureSelf       — 미래의 나 편집 (나머지 문항까지 펼쳐서)
 */

export const DEEP_LINK_SHEETS = ["goals", "affirmations", "futureSelf"] as const;
export type DeepLinkSheet = (typeof DEEP_LINK_SHEETS)[number];

const SHEET_PARAM = "sheet";
const REFINE_PARAM = "refine";

export interface SheetDeepLink {
  sheet: DeepLinkSheet | null;
  /** goals 시트에서만 의미 있다 — 다른 시트에서는 항상 false. */
  refine: boolean;
}

/** `?sheet=…&refine=1` 형태의 search 문자열을 해석한다. 모르는 값은 null. */
export function readSheetDeepLink(search: string): SheetDeepLink {
  try {
    const params = new URLSearchParams(search);
    const raw = params.get(SHEET_PARAM);
    const sheet = DEEP_LINK_SHEETS.find((s) => s === raw) ?? null;
    return {
      sheet,
      refine: sheet === "goals" && params.get(REFINE_PARAM) === "1",
    };
  } catch {
    return { sheet: null, refine: false };
  }
}

/**
 * 현재 URL 에서 시트 딥링크 쿼리만 지운다(다른 쿼리는 보존) — 뒤로가기/새로고침에 시트가
 * 다시 열리지 않게. 시트가 히스토리 엔트리를 쌓기(lib/useSheetHistory) **전에** 불러야
 * 그 아래 엔트리도 정리된 URL 을 갖는다.
 */
export function stripSheetDeepLink(): void {
  if (typeof window === "undefined") return;
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has(SHEET_PARAM) && !url.searchParams.has(REFINE_PARAM)) return;
    url.searchParams.delete(SHEET_PARAM);
    url.searchParams.delete(REFINE_PARAM);
    window.history.replaceState(window.history.state, "", url.toString());
  } catch {
    /* URL 파싱 불가 환경 — 쿼리만 남을 뿐 나머지는 정상 동작 */
  }
}
