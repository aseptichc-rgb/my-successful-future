/**
 * POST /api/auth/native-bridge
 *
 * 웹(TWA)에서 로그인된 사용자의 세션을 안드로이드 네이티브 Firebase Auth 로 옮겨주는 브릿지.
 *
 * 흐름:
 *   1) 사용자가 TWA(웹) 안에서 로그인 → 웹 Firebase SDK 가 ID 토큰 보유
 *   2) 웹 클라이언트가 이 엔드포인트에 Bearer <ID 토큰> 으로 POST
 *   3) 서버가 토큰을 검증한 뒤 동일 uid 로 customToken 발급
 *   4) 웹 클라이언트가 anima://auth?token=<customToken> 딥링크로 안드로이드 앱에 토큰 전달
 *   5) MainActivity 가 signInWithCustomToken 으로 네이티브 FirebaseAuth 에 동일 사용자 로그인
 *
 * 보안:
 *   - Bearer 토큰은 verifyIdToken 으로 검증 (위변조 차단).
 *   - 발급되는 customToken 은 자기 자신(uid)용. 다른 uid 권한 상승 경로 없음.
 *   - customToken 의 만료는 Firebase 가 자체 관리(약 1시간).
 *   - HTTPS 만 허용 — 평문 노출 시 사용자가 가로채일 수 있음. 운영은 Vercel 자동 TLS.
 */
import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/firebase-admin";
import { verifyRequestUser, AuthError } from "@/lib/authServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const me = await verifyRequestUser(request);
    const customToken = await getAdminAuth().createCustomToken(me.uid);
    return NextResponse.json({ customToken });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[auth/native-bridge] 실패:", msg);
    return NextResponse.json(
      { error: "네이티브 브릿지 토큰 발급에 실패했습니다." },
      { status: 500 },
    );
  }
}
