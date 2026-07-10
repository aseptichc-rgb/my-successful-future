/**
 * POST /api/entitlement/verify-apple
 *
 * iOS StoreKit2 클라이언트가 받은 `Transaction.signedTransaction` (JWS) 또는
 * `originalTransactionId` 를 서버가 Apple StoreKit Server API 로 검증한 뒤 Firebase
 * custom claim 의 `ent` 객체에 lifetime / subscription 권한을 박는다.
 *
 * 클라이언트는 응답으로 받은 customToken 으로 signInWithCustomToken 재로그인하거나,
 * 기존 sign-in 상태에서 user.getIdToken(true) 로 강제 새로고침해 새 claim 을 반영한다.
 *
 * 인증:
 *   Authorization: Bearer <Firebase ID Token> (이미 로그인된 사용자여야 함)
 *
 * 본문 (둘 중 하나만 보내도 됨):
 *   { signedTransactionInfo: string }   // StoreKit2 가 클라에 준 원본 JWS
 *   { transactionId: string }           // 또는 추출한 transactionId
 *   { productId: string }               // 검증된 product 와 매칭 (위장 차단)
 *
 * 응답:
 *   200 { ok: true, customToken, productId, purchaseTimeMs }
 *   400/401/402 — 검증 실패
 */
import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import { verifyRequestUser, AuthError } from "@/lib/authServer";
import { verifyAppleTransaction } from "@/lib/appleStoreKit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RequestBody {
  signedTransactionInfo?: string;
  transactionId?: string;
  productId?: string;
}

const ALLOWED_PRODUCT_IDS = (process.env.APPLE_LIFETIME_PRODUCT_IDS || "anima_lifetime")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const ALLOWED_SUBSCRIPTION_IDS = (process.env.APPLE_SUBSCRIPTION_PRODUCT_IDS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

export async function POST(request: NextRequest) {
  try {
    const me = await verifyRequestUser(request);

    let body: RequestBody;
    try {
      body = (await request.json()) as RequestBody;
    } catch {
      return NextResponse.json({ error: "요청 본문이 JSON 이 아닙니다." }, { status: 400 });
    }

    const signedTransactionInfo = body.signedTransactionInfo?.trim();
    const transactionId = body.transactionId?.trim();
    const declaredProductId = (body.productId || "").trim();

    if (!signedTransactionInfo && !transactionId) {
      return NextResponse.json(
        { error: "signedTransactionInfo / transactionId 둘 중 하나는 필요합니다." },
        { status: 400 },
      );
    }

    // 1) Apple StoreKit Server API 로 영수증 검증.
    const verification = await verifyAppleTransaction({
      signedTransactionInfo,
      transactionId,
    });
    if (!verification.ok) {
      return NextResponse.json(
        { error: "유효하지 않은 영수증입니다.", reason: verification.reason },
        { status: 402 },
      );
    }

    // 1-b) 샌드박스/TestFlight 거래가 운영 권한으로 승격되는 것을 차단(fail-closed).
    //      environment 를 확정하지 못한 경우도 운영에서는 거부한다.
    const useSandbox = process.env.APPLE_USE_SANDBOX === "true";
    if (!useSandbox && verification.environment !== "Production") {
      return NextResponse.json(
        { error: "샌드박스 거래는 운영에서 사용할 수 없습니다." },
        { status: 402 },
      );
    }

    const verifiedProductId = verification.productId || declaredProductId;
    if (!verifiedProductId) {
      return NextResponse.json(
        { error: "productId 를 확인하지 못했습니다." },
        { status: 402 },
      );
    }

    // 2) 클라가 선언한 productId 와 Apple 응답이 일치하는지(위장 차단).
    if (declaredProductId && declaredProductId !== verifiedProductId) {
      return NextResponse.json(
        { error: "선언된 productId 와 검증된 영수증이 불일치합니다." },
        { status: 401 },
      );
    }

    // 3) 허용 목록(env) 안의 상품인지.
    const isLifetime = ALLOWED_PRODUCT_IDS.includes(verifiedProductId);
    const isSubscription = ALLOWED_SUBSCRIPTION_IDS.includes(verifiedProductId);
    if (!isLifetime && !isSubscription) {
      return NextResponse.json(
        { error: "허용되지 않은 productId 입니다." },
        { status: 401 },
      );
    }
    if (isSubscription && !verification.expiresAtMs) {
      return NextResponse.json(
        { error: "구독 영수증에 expiresDate 가 없습니다." },
        { status: 402 },
      );
    }

    // 3-b) 영수증 재사용 차단 — 동일 originalTransactionId 가 이미 다른(회수되지 않은)
    //      계정에 등록돼 있으면 거부한다(1결제 → N계정 공유 방지).
    const db = getAdminDb();
    const originalTransactionId = verification.originalTransactionId?.trim();
    if (originalTransactionId) {
      const dupSnap = await db
        .collection("entitlements")
        .where("originalTransactionId", "==", originalTransactionId)
        .get();
      const claimedByOther = dupSnap.docs.find(
        (d) => d.id !== me.uid && d.data()?.revoked !== true,
      );
      if (claimedByOther) {
        return NextResponse.json(
          { error: "이미 다른 계정에 등록된 결제입니다." },
          { status: 409 },
        );
      }
    }

    const auth = getAdminAuth();
    const purchaseTime = verification.purchaseTimeMs ?? Date.now();

    // 4) Firebase custom claim 부여 — 평면 paid 대신 객체 ent 로 박는다 (iOS/Android 통일).
    //    setCustomUserClaims 는 전체 덮어쓰기이므로 trial 등 기존 claim 을 보존한다.
    const userRecord = await auth.getUser(me.uid);
    const currentClaims: Record<string, unknown> = { ...(userRecord.customClaims ?? {}) };
    const entClaim: Record<string, unknown> = isLifetime
      ? {
          kind: "lifetime",
          productId: verifiedProductId,
          grantedAt: purchaseTime,
          platform: "ios",
        }
      : {
          kind: "subscription",
          productId: verifiedProductId,
          grantedAt: purchaseTime,
          expiresAt: verification.expiresAtMs,
          platform: "ios",
        };
    await auth.setCustomUserClaims(me.uid, {
      ...currentClaims,
      ent: entClaim,
    });

    // 5) 검증 레코드 영구 저장 — 환불 처리 시 동일 originalTransactionId 로 무효화 가능.
    await db.doc(`entitlements/${me.uid}`).set(
      {
        uid: me.uid,
        platform: "ios",
        productId: verifiedProductId,
        originalTransactionId: originalTransactionId ?? null,
        purchaseTimeMs: purchaseTime,
        expiresAtMs: verification.expiresAtMs ?? null,
        verifiedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    // 6) 클라이언트가 즉시 새 claim 을 반영할 수 있도록 customToken 발급.
    const customToken = await auth.createCustomToken(me.uid, {
      // Firebase setCustomUserClaims 와 createCustomToken developer claims 는 별도 경로다.
      // 다음 ID 토큰부터 claim 이 반영되도록 ent 를 그대로 부착해 빠른 경로도 보장.
      ent: entClaim,
    });

    return NextResponse.json({
      ok: true,
      customToken,
      productId: verifiedProductId,
      purchaseTimeMs: purchaseTime,
      expiresAtMs: verification.expiresAtMs ?? null,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[entitlement/verify-apple] 실패:", msg);
    return NextResponse.json(
      { error: "결제 검증 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
