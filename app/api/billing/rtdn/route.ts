/**
 * POST /api/billing/rtdn
 *
 * Google Play Real-time Developer Notifications (RTDN) 수신 엔드포인트.
 * Play Console → 수익 창출 설정 → "실시간 개발자 알림" 에 등록한 Pub/Sub 토픽이,
 * push 구독을 통해 이 URL 로 환불/취소/차지백 이벤트를 밀어 넣는다.
 *
 * 핵심 처리: voidedPurchaseNotification (환불·차지백) 수신 시 해당 영수증의 소유자
 * 권한을 자동 회수한다. 이게 없으면 "환불 후에도 Pro 영구 사용" 구멍이 생긴다.
 *
 * 보안:
 *   push 구독 URL 에 ?token=<PLAY_RTDN_VERIFY_TOKEN> 을 붙여 등록하고, 이 라우트가
 *   쿼리 토큰을 상수시간 비교해 외부 위조 호출을 차단한다. (Google 권장 방식)
 *
 * 환경변수:
 *   PLAY_RTDN_VERIFY_TOKEN : push 구독 URL 의 ?token= 과 일치해야 하는 공유 비밀.
 *                            미설정 시 인증 불가로 간주해 모든 요청을 503 으로 막는다.
 *   ANDROID_PACKAGE_NAME   : 알림의 packageName 일치 검증(선택). 미설정 시 검증 생략.
 *
 * 응답 정책 (Pub/Sub 재시도 제어):
 *   2xx  = ack(재전송 안 함). 정상 처리 + "우리가 모르는 영수증/테스트 알림" 등 재시도 무의미 케이스.
 *   5xx  = 일시 오류(재전송 받음). Firestore/Auth 장애 등 재시도하면 성공할 수 있는 경우.
 *   401/403 = 인증 실패.
 */
import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { revokeEntitlementByPurchaseToken } from "@/lib/entitlementAdmin";
import { notifyTelegram } from "@/lib/telegramNotify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 배포 환경 변수 등록 방식에 따라 앞뒤 공백/개행이 섞일 수 있어 trim 으로 정규화한다.
const VERIFY_TOKEN = (process.env.PLAY_RTDN_VERIFY_TOKEN || "").trim();
const EXPECTED_PACKAGE_NAME = (process.env.ANDROID_PACKAGE_NAME || "").trim();

/** Google RTDN refundType. 1 = 전액 환불, 2 = 수량 기반 부분 환불. */
const REFUND_TYPE_FULL = 1;

interface PubSubEnvelope {
  message?: { data?: string; messageId?: string; publishTime?: string };
  subscription?: string;
}

interface VoidedPurchaseNotification {
  purchaseToken?: string;
  orderId?: string;
  /** 1 = subscription, 2 = one-time product */
  productType?: number;
  /** 1 = full refund, 2 = quantity-based partial refund */
  refundType?: number;
}

interface DeveloperNotification {
  version?: string;
  packageName?: string;
  eventTimeMillis?: string;
  voidedPurchaseNotification?: VoidedPurchaseNotification;
  testNotification?: { version?: string };
}

/** 로그에 영수증 토큰 전체를 남기지 않는다(민감정보) — 앞 8자만 노출. */
function maskToken(token: string): string {
  return token.length <= 8 ? "********" : `${token.slice(0, 8)}…(${token.length})`;
}

/** RTDN 코드값을 사람이 읽을 라벨로. */
function productTypeLabel(t: number | undefined): string {
  return t === 1 ? "구독" : t === 2 ? "일회성" : `미상(${t ?? "-"})`;
}
function refundTypeLabel(t: number | undefined): string {
  return t === REFUND_TYPE_FULL ? "전액 환불" : t === 2 ? "부분 환불" : `미상(${t ?? "-"})`;
}
function revokeStatusLabel(status: string): string {
  return status === "revoked"
    ? "권한 회수 완료"
    : status === "already_revoked"
      ? "이미 회수됨(중복 알림)"
      : status === "not_found"
        ? "회수 대상 없음(미검증/탈퇴 사용자)"
        : status;
}

/** eventTimeMillis(ms) 를 KST 사람용 문자열로. 값이 없으면 '-'. */
function formatKst(eventTimeMillis: string | undefined): string {
  if (!eventTimeMillis) return "-";
  const ms = Number(eventTimeMillis);
  if (!Number.isFinite(ms) || ms <= 0) return "-";
  return new Date(ms).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }) + " KST";
}

/** 길이 노출 없이 상수시간 비교 — 타이밍 공격 방지. */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export async function POST(request: NextRequest) {
  // 0) 인증 — 공유 비밀이 설정돼 있지 않으면 검증 불가이므로 전면 차단.
  if (!VERIFY_TOKEN) {
    console.error("[rtdn] PLAY_RTDN_VERIFY_TOKEN 미설정 — 수신 거부.");
    return NextResponse.json({ error: "RTDN is not configured" }, { status: 503 });
  }
  const provided = request.nextUrl.searchParams.get("token") || "";
  if (!safeEqual(provided, VERIFY_TOKEN)) {
    return NextResponse.json({ error: "Authentication failed" }, { status: 403 });
  }

  // 1) Pub/Sub envelope 파싱
  let envelope: PubSubEnvelope;
  try {
    envelope = (await request.json()) as PubSubEnvelope;
  } catch {
    // 깨진 본문은 재시도해도 동일 — ack 하고 드롭.
    console.warn("[rtdn] 본문이 JSON 이 아님 — drop.");
    return NextResponse.json({ ok: true, ignored: "bad_json" });
  }

  const data = envelope.message?.data;
  if (!data) {
    return NextResponse.json({ ok: true, ignored: "no_data" });
  }

  // 2) base64 → DeveloperNotification 디코드
  let notification: DeveloperNotification;
  try {
    const decoded = Buffer.from(data, "base64").toString("utf8");
    notification = JSON.parse(decoded) as DeveloperNotification;
  } catch {
    console.warn("[rtdn] message.data 디코드 실패 — drop.");
    return NextResponse.json({ ok: true, ignored: "bad_payload" });
  }

  // 3) 테스트 알림 — 등록 직후 Play 가 보내는 헬스체크. ack.
  if (notification.testNotification) {
    console.info("[rtdn] testNotification 수신 — ack.");
    return NextResponse.json({ ok: true, test: true });
  }

  // 4) 패키지명 검증(설정 시) — 다른 앱/위조 알림 차단. 우리 것이 아니면 조용히 ack.
  if (EXPECTED_PACKAGE_NAME && notification.packageName !== EXPECTED_PACKAGE_NAME) {
    console.warn(`[rtdn] packageName 불일치(${notification.packageName}) — ignore.`);
    return NextResponse.json({ ok: true, ignored: "package_mismatch" });
  }

  // 5) 환불/차지백 이외 알림(예: 구독 상태 변경)은 현재 처리 대상 아님 — ack.
  const voided = notification.voidedPurchaseNotification;
  if (!voided?.purchaseToken) {
    return NextResponse.json({ ok: true, ignored: "not_voided" });
  }

  // 6) 권한 회수
  try {
    const result = await revokeEntitlementByPurchaseToken(voided.purchaseToken, "voided_purchase", {
      voidedOrderId: voided.orderId ?? null,
      voidedProductType: voided.productType ?? null,
      voidedRefundType: voided.refundType ?? null,
      voidedEventTimeMs: notification.eventTimeMillis
        ? Number(notification.eventTimeMillis)
        : null,
    });

    const isFullRefund = (voided.refundType ?? REFUND_TYPE_FULL) === REFUND_TYPE_FULL;
    console.info(
      `[rtdn] voided 처리: token=${maskToken(voided.purchaseToken)} ` +
        `status=${result.status} full=${isFullRefund}`,
    );

    // 운영자 텔레그램 알림 — 중복 전송(already_revoked)은 스팸이 되므로 제외.
    // 서버리스에서 응답 후 작업이 죽을 수 있어 ack 전에 await (실패해도 ack 는 진행).
    if (result.status !== "already_revoked") {
      await notifyTelegram(
        [
          "💸 환불 발생 (anima)",
          `상태: ${revokeStatusLabel(result.status)}`,
          result.uid ? `uid: ${maskToken(result.uid)}` : null,
          voided.orderId ? `orderId: ${voided.orderId}` : null,
          `종류: ${productTypeLabel(voided.productType)} / ${refundTypeLabel(voided.refundType)}`,
          `시각: ${formatKst(notification.eventTimeMillis)}`,
        ]
          .filter(Boolean)
          .join("\n"),
      );
    }

    // not_found(이미 탈퇴/미검증) · already_revoked(중복 전송) 모두 재시도 무의미 → ack.
    return NextResponse.json({ ok: true, status: result.status });
  } catch (err) {
    // Firestore/Auth 일시 장애 — 5xx 로 돌려 Pub/Sub 재전송 유도.
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[rtdn] 회수 실패(재시도 유도): ${msg}`);
    return NextResponse.json({ error: "Failed to revoke entitlement" }, { status: 500 });
  }
}
