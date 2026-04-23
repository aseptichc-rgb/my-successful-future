import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // /api/session/login 에서 발급한 httpOnly 세션 쿠키 존재 여부만 가볍게 본다.
  // 실제 검증은 API 라우트의 verifyRequestUser 가 담당.
  const authCookie = request.cookies.get("__session");

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
