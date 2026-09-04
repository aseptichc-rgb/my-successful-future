/**
 * "오늘 잘한 일" 초안 저장 판정 — 순수 모듈(Firebase SDK 비의존).
 *
 * 왜 별도 모듈인가:
 *   - 저장 트리거가 둘이다. 타이핑 디바운스([components/home/MoreSection] handleChangeWin)와
 *     즉시 flush(포커스 아웃 · 앱 이탈). 둘이 각자 dirty 판정을 들고 있으면 한쪽만 바뀌었을 때
 *     "타이핑으로는 저장되는데 flush 로는 안 되는" 조용한 어긋남이 난다.
 *   - 컴포넌트에는 테스트 하네스가 없다(vitest include: lib/**, scripts/**). 판정을 여기로
 *     끌어내면 저장 여부라는 가장 중요한 계약을 단위 테스트로 고정할 수 있다.
 */

/** 저장/비교 시 한 칸의 정규형 — undefined·null 구멍을 빈 문자열로 메운다(옛 문서 방어). */
function cell(value: string | undefined): string {
  return value || "";
}

/**
 * 자동 저장/flush 가 실제로 저장을 걸어야 하는가.
 *
 * 두 조건을 모두 만족할 때만 true:
 *   1) 저장본과 달라졌다(dirty) — 같은 값을 반복해서 쓰지 않는다.
 *   2) 지금 내용이 한 칸이라도 남아 있다 — 전부 지운 상태를 자동 저장이 대신 확정하지 않는다.
 *      (빈 배열로 덮는 건 사용자의 명시적 삭제여야 한다.)
 *
 * @param wins 화면의 현재 초안.
 * @param savedWins 오늘 문서에 저장돼 있는 값. 길이가 달라도 안전하게 비교한다.
 */
export function shouldSaveWins(wins: string[], savedWins: string[]): boolean {
  const length = Math.max(wins.length, savedWins.length);
  let dirty = false;
  for (let i = 0; i < length; i += 1) {
    if (cell(wins[i]) !== cell(savedWins[i])) {
      dirty = true;
      break;
    }
  }
  if (!dirty) return false;
  return wins.some((w) => cell(w).trim().length > 0);
}

/**
 * 중복 저장 판별용 스냅샷 키 — "이미 저장을 건 값" 과 지금 값이 같은지 비교한다.
 * 포커스 아웃과 앱 이탈이 잇달아 flush 를 부를 때 같은 값을 두 번 쓰지 않기 위함.
 * 칸 위치도 기록의 일부이므로 순서를 보존해 직렬화한다.
 */
export function winsSnapshotKey(wins: string[]): string {
  return JSON.stringify(wins.map(cell));
}
