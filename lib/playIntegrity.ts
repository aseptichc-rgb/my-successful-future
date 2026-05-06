/**
 * Play Integrity API 토큰 검증.
 *
 * 결제 영수증만 검증하면 "정상 영수증을 어딘가에서 빼와서 가짜 클라이언트가 사용" 하는
 * replay 공격에 약하다. Play Integrity 는 호출자가 "구글 플레이에서 받은 정품 APK + 정상 기기"
 * 임을 보증한다. 영수증 검증과 함께 쓰면:
 *   - 영수증: 결제가 진짜인가
 *   - Integrity: 호출자가 진짜 우리 앱인가
 *
 * 운영 구현 (3단계에서 교체):
 *   import { google } from "googleapis";
 *   const auth = new google.auth.GoogleAuth({
 *     credentials: JSON.parse(process.env.GOOGLE_PLAY_SA_KEY!),
 *     scopes: ["https://www.googleapis.com/auth/playintegrity"],
 *   });
 *   const integrity = google.playintegrity({ version: "v1", auth });
 *   const res = await integrity.v1.decodeIntegrityToken({
 *     packageName,
 *     requestBody: { integrityToken },
 *   });
 *   const payload = res.data.tokenPayloadExternal;
 *   const ok = payload?.appIntegrity?.appRecognitionVerdict === "PLAY_RECOGNIZED"
 *           && payload?.deviceIntegrity?.deviceRecognitionVerdict?.includes("MEETS_DEVICE_INTEGRITY");
 *   const matchesNonce = payload?.requestDetails?.nonce === expectedNonce;
 *
 * 현재는 스텁.
 */
export interface IntegrityVerifyResult {
  ok: boolean;
  /** "PLAY_RECOGNIZED" | "UNRECOGNIZED_VERSION" | "UNEVALUATED" 등 */
  appVerdict?: string;
  /** "MEETS_DEVICE_INTEGRITY" | "MEETS_BASIC_INTEGRITY" | "MEETS_STRONG_INTEGRITY" 등 */
  deviceVerdict?: string;
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

export async function verifyPlayIntegrity(
  input: VerifyIntegrityInput,
): Promise<IntegrityVerifyResult> {
  if (DEV_BYPASS) {
    return {
      ok: true,
      appVerdict: "PLAY_RECOGNIZED",
      deviceVerdict: "MEETS_DEVICE_INTEGRITY",
      nonceMatched: true,
      reason: "dev_bypass",
    };
  }

  // TODO(step3): googleapis 의 playintegrity v1 통합으로 교체.
  throw new Error(
    "verifyPlayIntegrity: 운영 구현 미완료. " +
      "PLAY_INTEGRITY_DEV_BYPASS=true 로 임시 우회하거나 Play Integrity API 통합을 마쳐주세요.",
  );
}
