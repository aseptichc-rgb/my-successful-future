/**
 * POST /api/entitlement/verify
 *
 * 안드로이드 클라이언트가 BillingClient.queryPurchasesAsync 로 받은 영수증을
 * 서버가 Google Play Developer API 로 직접 검증한 뒤 Firebase custom claim 에
 * paid=true / productId / purchaseTime 을 박는다.
 *
 * 클라이언트는 응답으로 받은 customToken 으로 signInWithCustomToken 재로그인하거나,
 * 기존 sign-in 상태에서 user.getIdToken(true) 로 강제 새로고침해 새 claim 을 반영한다.
 *
 * 인증:
 *   Authorization: Bearer <Firebase ID Token> (이미 로그인된 사용자여야 함)
 *
 * 본문:
 *   { purchaseToken, productId, packageName, integrityToken? }
 *
 * 응답:
 *   200 { ok: true, customToken } — 결제 검증 성공
 *   400/401/402  — 검증 실패 (각 단계별 사유는 error 필드)
 */
import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import { verifyRequestUser, AuthError } from "@/lib/authServer";
import { verifyAndroidPurchase } from "@/lib/playBilling";
import { verifyPlayIntegrity } from "@/lib/playIntegrity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RequestBody {
  purchaseToken?: string;
  productId?: string;
  packageName?: string;
  integrityToken?: string;
  expectedNonce?: string;
}

const EXPECTED_PACKAGE_NAME = process.env.ANDROID_PACKAGE_NAME || "";
const EXPECTED_PRODUCT_ID = process.env.ANDROID_LIFETIME_PRODUCT_ID || "";

export async function POST(request: NextRequest) {
  try {
    const me = await verifyRequestUser(request);

    let body: RequestBody;
    try {
      body = (await request.json()) as RequestBody;
    } catch {
      return NextResponse.json({ error: "요청 본문이 JSON 이 아닙니다." }, { status: 400 });
    }

    const purchaseToken = (body.purchaseToken || "").trim();
    const productId = (body.productId || "").trim();
    const packageName = (body.packageName || "").trim();
    const integrityToken = (body.integrityToken || "").trim();
    const expectedNonce = (body.expectedNonce || "").trim() || undefined;

    if (!purchaseToken || !productId || !packageName) {
      return NextResponse.json(
        { error: "purchaseToken/productId/packageName 누락." },
        { status: 400 },
      );
    }

    // 운영 환경에 패키지명/상품 ID 가 박혀 있으면 일치 검증 (위장 차단)
    if (EXPECTED_PACKAGE_NAME && packageName !== EXPECTED_PACKAGE_NAME) {
      return NextResponse.json(
        { error: "허용되지 않은 packageName 입니다." },
        { status: 401 },
      );
    }
    if (EXPECTED_PRODUCT_ID && productId !== EXPECTED_PRODUCT_ID) {
      return NextResponse.json(
        { error: "허용되지 않은 productId 입니다." },
        { status: 401 },
      );
    }

    // 1) Play Integrity 가 있으면 함께 검증 (생략 가능 — 운영에서는 강제 권장)
    if (integrityToken) {
      const integrity = await verifyPlayIntegrity({
        packageName,
        integrityToken,
        expectedNonce,
      });
      if (!integrity.ok) {
        return NextResponse.json(
          { error: "Play Integrity 검증 실패", reason: integrity.reason },
          { status: 401 },
        );
      }
    }

    // 2) 영수증 검증 (가장 핵심)
    const purchase = await verifyAndroidPurchase({
      packageName,
      productId,
      purchaseToken,
    });
    if (!purchase.ok) {
      return NextResponse.json(
        { error: "유효하지 않은 영수증입니다.", reason: purchase.reason },
        { status: 402 },
      );
    }

    const auth = getAdminAuth();
    const purchaseTime = purchase.purchaseTimeMs ?? Date.now();

    // 3) Firebase custom claim 부여 — 다음 ID 토큰부터 paid=true 가 박힌다.
    await auth.setCustomUserClaims(me.uid, {
      paid: true,
      productId,
      purchaseTime,
    });

    // 4) 검증 레코드를 entitlements/{uid} 에 영구 저장 (감사·재검증 캐시)
    const db = getAdminDb();
    await db.doc(`entitlements/${me.uid}`).set(
      {
        uid: me.uid,
        productId,
        packageName,
        purchaseToken,
        purchaseTimeMs: purchaseTime,
        purchaseState: purchase.purchaseState ?? null,
        acknowledgementState: purchase.acknowledgementState ?? null,
        verifiedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    // 5) 클라이언트가 즉시 새 claim 을 반영할 수 있도록 customToken 발급
    const customToken = await auth.createCustomToken(me.uid, {
      paid: true,
      productId,
    });

    return NextResponse.json({
      ok: true,
      customToken,
      productId,
      purchaseTimeMs: purchaseTime,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[entitlement/verify] 실패:", msg);
    return NextResponse.json(
      { error: "결제 검증 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
