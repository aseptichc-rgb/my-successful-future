/**
 * POST /api/apple-webhook
 *
 * App Store Server Notifications V2 수신 엔드포인트.
 * App Store Connect → 앱 → 일반 정보 → "App Store Server Notifications" 의
 * Production / Sandbox URL 에 이 주소를 등록하면, Apple 이 환불/취소/갱신 이벤트를
 * 서명된 JWS(signedPayload) 로 이 URL 에 직접 푸시한다.
 *
 * 핵심 처리: REFUND(환불) / REVOKE(가족 공유 회수) 수신 시 해당 거래 소유자의 권한을
 * 자동 회수한다. 이게 없으면 "환불 후에도 Pro 영구 사용" 구멍이 생긴다.
 * (Android RTDN 웹훅 /api/billing/rtdn 의 iOS 등가물.)
 *
 * 인증:
 *   공유 토큰이 아니라 Apple 이 서명한 JWS 그 자체가 인증이다 (verifyAppleNotification).
 *   바깥 알림 JWS + 안쪽 거래 JWS 의 이중 서명과 bundleId 일치를 모두 검증한다.
 *
 * 응답 정책 (Apple 재시도 제어 — V2 는 비 2xx 면 수 시간에 걸쳐 재전송):
 *   2xx  = ack(재전송 안 함). 정상 처리 + "우리가 모르는 거래/대상 외 알림" 등 재시도 무의미 케이스.
 *   5xx  = 일시 오류(재전송 받음). Firestore/Auth 장애 등 재시도하면 성공할 수 있는 경우.
 *   400  = 서명 검증 실패/형식 오류 (위조 또는 손상 — 재시도해도 동일).
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyAppleNotification } from "@/lib/appleStoreKit";
import { revokeEntitlementByOriginalTransactionId } from "@/lib/entitlementAdmin";
import { notifyTelegram } from "@/lib/telegramNotify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 권한 회수를 유발하는 알림 종류 — 환불 및 가족 공유 회수. */
const REVOKING_NOTIFICATION_TYPES = new Set(["REFUND", "REVOKE"]);

interface AppleWebhookBody {
  signedPayload?: string;
}

/** 로그에 거래 식별자 전체를 남기지 않는다 — 앞 6자만 노출. */
function maskId(id: string | undefined): string {
  if (!id) return "-";
  return id.length <= 6 ? "******" : `${id.slice(0, 6)}…(${id.length})`;
}

/** revoke 상태값을 사람이 읽을 라벨로 (RTDN 웹훅과 동일 표기). */
function revokeStatusLabel(status: string): string {
  return status === "revoked"
    ? "권한 회수 완료"
    : status === "already_revoked"
      ? "이미 회수됨(중복 알림)"
      : status === "not_found"
        ? "회수 대상 없음(미검증/탈퇴 사용자)"
        : status;
}

/** signedDate(ms) 를 KST 사람용 문자열로. 값이 없으면 '-'. */
function formatKst(signedDateMs: number | undefined): string {
  if (!signedDateMs || !Number.isFinite(signedDateMs) || signedDateMs <= 0) return "-";
  return new Date(signedDateMs).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }) + " KST";
}

export async function POST(request: NextRequest) {
  // 1) 본문 파싱 — { signedPayload }.
  let body: AppleWebhookBody;
  try {
    body = (await request.json()) as AppleWebhookBody;
  } catch {
    // 깨진 본문은 재시도해도 동일 — 400 으로 드롭.
    console.warn("[apple-webhook] 본문이 JSON 이 아님 — drop.");
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }

  const signedPayload = body.signedPayload?.trim();
  if (!signedPayload) {
    return NextResponse.json({ error: "signedPayload 누락" }, { status: 400 });
  }

  // 2) Apple 서명 검증 + 디코드 (인증). 실패 = 위조/손상 → 400(재시도 무의미).
  const verified = verifyAppleNotification(signedPayload);
  if (!verified.ok) {
    console.warn(`[apple-webhook] 검증 실패: ${verified.reason}`);
    return NextResponse.json({ error: "검증 실패", reason: verified.reason }, { status: 400 });
  }

  const type = verified.notificationType ?? "";

  // 3) 테스트 알림 — App Store Connect 의 "Request a Test Notification" 헬스체크. ack.
  if (type === "TEST") {
    console.info("[apple-webhook] TEST 알림 수신 — ack.");
    return NextResponse.json({ ok: true, test: true });
  }

  // 4) 환불/회수 이외 알림(구독 갱신·만료 등)은 현재 처리 대상 아님 — ack.
  if (!REVOKING_NOTIFICATION_TYPES.has(type)) {
    return NextResponse.json({ ok: true, ignored: "not_revoking", notificationType: type });
  }

  // 5) 회수 키 추출 — originalTransactionId 가 없으면 처리 불가 → ack(재시도 무의미).
  const originalTransactionId = verified.transaction?.originalTransactionId;
  if (!originalTransactionId) {
    console.warn(`[apple-webhook] ${type} 인데 originalTransactionId 없음 — ignore.`);
    return NextResponse.json({ ok: true, ignored: "no_original_transaction_id" });
  }

  // 6) 권한 회수.
  try {
    const reason = type === "REFUND" ? "apple_refund" : "apple_revoke";
    const result = await revokeEntitlementByOriginalTransactionId(originalTransactionId, reason, {
      notificationType: type,
      notificationSubtype: verified.subtype ?? null,
      notificationUUID: verified.notificationUUID ?? null,
      productId: verified.transaction?.productId ?? null,
      revocationDateMs: verified.transaction?.revocationDate ?? null,
      revocationReason: verified.transaction?.revocationReason ?? null,
      environment: verified.environment ?? null,
    });

    console.info(
      `[apple-webhook] ${type} 처리: origTxn=${maskId(originalTransactionId)} ` +
        `status=${result.status} env=${verified.environment ?? "-"}`,
    );

    // 운영자 텔레그램 알림 — 중복 전송(already_revoked)은 스팸이 되므로 제외.
    // 서버리스에서 응답 후 작업이 죽을 수 있어 ack 전에 await (실패해도 ack 는 진행).
    if (result.status !== "already_revoked") {
      await notifyTelegram(
        [
          "💸 환불/회수 발생 (anima · iOS)",
          `종류: ${type}${verified.subtype ? ` / ${verified.subtype}` : ""}`,
          `상태: ${revokeStatusLabel(result.status)}`,
          result.uid ? `uid: ${result.uid}` : null,
          verified.transaction?.productId ? `productId: ${verified.transaction.productId}` : null,
          `환경: ${verified.environment ?? "-"}`,
          `시각: ${formatKst(verified.signedDate)}`,
        ]
          .filter(Boolean)
          .join("\n"),
      );
    }

    // not_found(미검증/탈퇴) · already_revoked(중복) 모두 재시도 무의미 → ack.
    return NextResponse.json({ ok: true, status: result.status });
  } catch (err) {
    // Firestore/Auth 일시 장애 — 5xx 로 돌려 Apple 재전송 유도.
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[apple-webhook] 회수 실패(재시도 유도): ${msg}`);
    return NextResponse.json({ error: "회수 처리 실패" }, { status: 500 });
  }
}
