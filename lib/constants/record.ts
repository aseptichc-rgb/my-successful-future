/**
 * 기록 탭(잘한 일 · 내일 첫 행동) 입력 상수 — 두 컴포넌트가 같은 자동 저장 리듬을 쓴다.
 * 문서 한도(MAX_DAILY_WINS, TOMORROW_FIRST_ACTION_MAX)는 저장 함수 곁(lib/firebase)에 있다.
 */

/** 잘한 일 한 줄 최대 글자 수. */
export const WIN_MAX = 140;
/** 입력이 멈춘 뒤 자동 저장까지의 디바운스(ms). */
export const WINS_AUTOSAVE_MS = 600;
/** "저장됐어요" 표시 유지 시간(ms). */
export const WINS_SAVED_TOAST_MS = 1800;
/** 잘한 일은 1칸만 펼쳐두고 나머지는 "한 줄 더"로 — 빈 칸 3개는 숙제처럼 읽힌다. */
export const WINS_INITIAL_VISIBLE = 1;
