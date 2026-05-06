/**
 * Play Integrity API 토큰 검증.
 *
 * 결제 영수증만 검증하면 "정상 영수증을 어딘가에서 빼와서 가짜 클라이언트가 사용" 하는
 * replay 공격에 약하다. Play Integrity 는 호출자가 "구글 플레이에서 받은 정품 APK + 정상 기기"
 * 임을 보증한다. 영수증 검증과 함께 쓰면:
 *   - 영수증: 결제가 진짜인가
 *   - Integrity: 호출자가 진짜 우리 앱인가
 *
 * 환경변수:
 *   GOOGLE_PLAY_SA_KEY              : 서비스 계정 JSON. Play Integrity 권한도 부여돼야 함.
 *   PLAY_INTEGRITY_DEV_BYPASS=true  : 검증 스킵 (베타/로컬 테스트 용)
 */
import { google } from "googleapis";

export interface IntegrityVerifyResult {
  ok: boolean;
  /** "PLAY_RECOGNIZED" | "UNRECOGNIZED_VERSION" | "UNEVALUATED" 등 */
  appVerdict?: string;
  /** "MEETS_DEVICE_INTEGRITY" | "MEETS_BASIC_INTEGRITY" | "MEETS_STRONG_INTEGRITY" 등 */
  deviceVerdict?: string[];
  /** nonce 가 클라이언트가 기대한 값과 일치하는지 */
  nonceMatched?: boolean;
  reason?: string;
}

export interface VerifyIntegrityInput {
  packageName: string;
  integrityToken: string;
  /** 클라이언트가 BillingClient 호출 직전에 서버에서 받아두었던 nonce. 있으면 일치 검증. */
  expectedNonce?: string;
}

const DEV_BYPASS = process.env.PLAY_INTEGRITY_DEV_BYPASS === "true";

let cachedIntegrity: ReturnType<typeof google.playintegrity> | null = null;

function getIntegrity() {
  if (cachedIntegrity) return cachedIntegrity;
  const raw = process.env.GOOGLE_PLAY_SA_KEY;
  if (!raw) {
    throw new Error(
      "GOOGLE_PLAY_SA_KEY 미설정. 운영에서는 서비스 계정 JSON 을 설정하거나 PLAY_INTEGRITY_DEV_BYPASS=true 로 우회해야 합니다.",
    );
  }
  let credentials: Record<string, unknown>;
  try {
    credentials = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      "GOOGLE_PLAY_SA_KEY 가 유효한 JSON 이 아닙니다: " +
        (err instanceof Error ? err.message : String(err)),
    );
  }
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/playintegrity"],
  });
  cachedIntegrity = google.playintegrity({ version: "v1", auth });
  return cachedIntegrity;
}

export async function verifyPlayIntegrity(
  input: VerifyIntegrityInput,
): Promise<IntegrityVerifyResult> {
  if (DEV_BYPASS) {
    return {
      ok: true,
      appVerdict: "PLAY_RECOGNIZED",
      deviceVerdict: ["MEETS_DEVICE_INTEGRITY"],
      nonceMatched: true,
      reason: "dev_bypass",
    };
  }

  try {
    const integrity = getIntegrity();
    const res = await integrity.v1.decodeIntegrityToken({
      packageName: input.packageName,
      requestBody: { integrityToken: input.integrityToken },
    });
    const payload = res.data.tokenPayloadExternal;
    const appVerdict =
      payload?.appIntegrity?.appRecognitionVerdict ?? undefined;
    const deviceVerdict =
      payload?.deviceIntegrity?.deviceRecognitionVerdict ?? undefined;
    const nonceFromToken = payload?.requestDetails?.nonce;
    const nonceMatched = input.expectedNonce
      ? nonceFromToken === input.expectedNonce
      : true;

    const appOk = appVerdict === "PLAY_RECOGNIZED";
    const deviceOk =
      Array.isArray(deviceVerdict) &&
      deviceVerdict.some(
        (v) =>
          v === "MEETS_DEVICE_INTEGRITY" ||
          v === "MEETS_STRONG_INTEGRITY" ||
          v === "MEETS_BASIC_INTEGRITY",
      );

    const ok = appOk && deviceOk && nonceMatched;
    return {
      ok,
      appVerdict,
      deviceVerdict: deviceVerdict ?? undefined,
      nonceMatched,
      reason: ok
        ? undefined
        : !appOk
          ? `appVerdict=${appVerdict}`
          : !deviceOk
            ? `deviceVerdict=${(deviceVerdict ?? []).join(",")}`
            : "nonce_mismatch",
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: msg };
  }
}
