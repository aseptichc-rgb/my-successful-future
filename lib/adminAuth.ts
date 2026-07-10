/**
 * 어드민 전용 라우트 게이트 (DRY) — 4개 admin 라우트가 복붙하던 Bearer→verifyIdToken→isAdminEmail
 * 검증을 한 곳으로 모은다. 어드민 라우트는 세션 쿠키 폴백 없이 Bearer 전용이다.
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/firebase-admin";
import { isAdminEmail } from "@/lib/tokenUsage";

/**
 * Bearer ID 토큰을 검증하고 이메일이 ADMIN_EMAILS 목록에 있는지 확인한다.
 * 통과하면 null, 실패하면 그대로 반환할 에러 응답(401/403)을 돌려준다.
 */
export async function assertAdminRequest(req: NextRequest): Promise<NextResponse | null> {
  const header = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  if (!header.startsWith("Bearer ")) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }
  try {
    const decoded = await getAdminAuth().verifyIdToken(header.slice(7).trim());
    if (!isAdminEmail(decoded.email)) {
      return NextResponse.json({ error: "접근 권한이 없습니다." }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: "유효하지 않은 토큰입니다." }, { status: 401 });
  }
  return null;
}
