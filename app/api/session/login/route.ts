import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/firebase-admin";

// Firebase 세션 쿠키 최대 수명(14일). 그 이상은 Admin SDK가 거부한다.
const SESSION_COOKIE_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const SESSION_COOKIE_NAME = "__session";

export async function POST(request: NextRequest) {
  try {
    const { idToken } = await request.json();
    if (!idToken || typeof idToken !== "string") {
      return NextResponse.json({ error: "idToken이 필요합니다." }, { status: 400 });
    }

    // ID 토큰은 발급 후 5분 이내여야 세션 쿠키로 교환 가능.
    // 클라이언트가 방금 getIdToken()/getIdToken(true)로 받은 값을 넘겨야 한다.
    const sessionCookie = await getAdminAuth().createSessionCookie(idToken, {
      expiresIn: SESSION_COOKIE_MAX_AGE_MS,
    });

    const response = NextResponse.json({ ok: true });
    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: sessionCookie,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_COOKIE_MAX_AGE_MS / 1000,
    });
    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : "세션 쿠키 발급에 실패했습니다.";
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
