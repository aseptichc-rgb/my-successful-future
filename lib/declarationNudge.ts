/**
 * "성공 선언이 목표의 파생본인가" 판정 — 순수 함수, Firebase/DOM 의존 없음.
 *
 * 배경: 예전에는 다짐을 목표에서 파생했다("매일 30분 책을 읽는다" → "나는 매일 30분
 * 책을 읽는다"). 그 시절 온보딩을 마친 사용자는 홈에서 사실상 같은 문장을 두 번 본다
 * — 성공 선언 카드와 오늘의 목표 카드에. 버그처럼 읽히므로 한 번 안내해야 한다.
 *
 * 판정에 옛 파생 함수를 되살리지 않는다. 파생은 접두사를 앞에 붙이는 것뿐이었으므로
 * "선언이 목표로 끝나고, 남는 앞부분이 접두사 길이 이내" 면 파생본이다. 로케일별
 * 접두사 테이블이 필요 없고, 어떤 언어의 계정에도 같은 규칙이 적용된다.
 *
 * 오탐 방어가 길이 조건에 있다. 이것 없이 endsWith 만 쓰면 목표가 짧을 때
 * (목표 "독서" / 선언 "나는 매일 아침 독서") 직접 쓴 선언까지 파생본으로 오인한다.
 */
import { LEGACY_AFFIRMATION_PREFIX_MAX } from "@/lib/constants/goal";

/** trim + 연속 공백 축약. 저장 경로가 달라 공백이 어긋난 레거시 값도 같게 본다. */
function normalize(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.trim().replace(/\s+/g, " ");
}

/**
 * 선언이 목표의 자동 파생본인지 여부.
 * 둘 중 하나라도 비어 있으면 false — 안내할 대상이 아니다.
 */
export function isDerivedDeclaration(declaration: unknown, goal: unknown): boolean {
  const decl = normalize(declaration);
  const g = normalize(goal);
  if (decl.length === 0 || g.length === 0) return false;
  if (!decl.endsWith(g)) return false;
  return decl.length - g.length <= LEGACY_AFFIRMATION_PREFIX_MAX;
}
