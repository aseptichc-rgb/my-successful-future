import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Firebase Auth는 클라이언트 사이드에서 관리되므로
  // 쿠키 기반의 간단한 인증 체크 사용
  const authCookie = request.cookies.get("firebase-auth-token");

  const isAuthPage = pathname.startsWith("/login") || pathname.startsWith("/signup");
  const isChatPage = pathname.startsWith("/chat");

  // 인증된 사용자가 auth 페이지 접근 시 → /chat 리다이렉트
  if (isAuthPage && authCookie) {
    return NextResponse.redirect(new URL("/chat", request.url));
  }

  // 나머지는 클라이언트 사이드 AuthProvider에서 보호
  return NextResponse.next();
}

export const config = {
  matcher: ["/login", "/signup", "/chat/:path*"],
};
