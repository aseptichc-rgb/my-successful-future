/**
 * 결제·무결성 검증을 통째로 우회하는 위험 플래그(DEV_BYPASS 류)를 단일 지점에서
 * 안전하게 평가한다. 베타·로컬에서 스토어 검증 없이 결제 흐름을 돌리기 위한 장치지만,
 * 프로덕션 환경변수에 실수로 'true' 가 섞이면 곧바로 "결제 우회" 사고가 된다.
 *
 * 안전장치:
 *   process.env.NODE_ENV === 'production' 이면 환경변수 값과 무관하게 항상 우회를
 *   무시하고 정상 검증을 수행한다. 무시가 발생하면 플래그당 1회 경고 로그를 남겨
 *   운영자가 잘못된 설정을 인지하도록 한다.
 */

const PRODUCTION = process.env.NODE_ENV === "production";

/** 같은 플래그에 대한 경고 로그 중복 방지 — 플래그명 1회만 기록. */
const warnedFlags = new Set<string>();

/**
 * 주어진 환경변수가 'true' 로 우회를 요청하는지 평가하되, 프로덕션에서는 강제로 false.
 *
 * @param envVar 우회 플래그 환경변수명 (예: 'PLAY_BILLING_DEV_BYPASS')
 * @returns 우회를 적용할지 여부. 프로덕션에서는 항상 false.
 */
export function resolveDevBypass(envVar: string): boolean {
  const requested = process.env[envVar] === "true";
  if (!requested) return false;

  if (PRODUCTION) {
    if (!warnedFlags.has(envVar)) {
      warnedFlags.add(envVar);
      console.error(
        `[devBypass] ${envVar}=true 가 프로덕션에서 감지됨 — 보안상 무시하고 정상 검증을 수행합니다. ` +
          "운영 환경변수에서 이 플래그를 제거하세요.",
      );
    }
    return false;
  }

  return true;
}
