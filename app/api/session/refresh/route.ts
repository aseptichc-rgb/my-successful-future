import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/firebase-admin";

const SESSION_COOKIE_NAME = "__session";

/**
 * iOS/Android PWA에서 IndexedDB가 ITP/스토리지 압박으로 축출된 뒤
 * 첫 진입 시 호출. 서버는 httpOnly 세션 쿠키를 검증해 커스텀 토큰을 발급하고,
 * 클라이언트는 signInWithCustomToken으로 Firebase 클라이언트 SDK를 복원한다.
 */
export async function GET(request: NextRequest) {
  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!cookie) {
    return NextResponse.json({ error: "세션 쿠키가 없습니다." }, { status: 401 });
  }
  try {
    // checkRevoked=true 로 비활성화/탈취된 세션도 차단
    const decoded = await getAdminAuth().verifySessionCookie(cookie, true);
    const customToken = await getAdminAuth().createCustomToken(decoded.uid);
    return NextResponse.json({ customToken });
  } catch {
    // 만료/위조/탈취된 쿠키 → 클라이언트가 cookie clear 하도록 401 반환
    const response = NextResponse.json({ error: "유효하지 않은 세션입니다." }, { status: 401 });
    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: "",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
    return response;
  }
}
