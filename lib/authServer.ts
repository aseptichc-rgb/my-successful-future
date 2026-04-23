/**
 * 서버 측 Firebase ID 토큰 검증 및 세션 권한 확인 헬퍼.
 * 클라이언트가 보낸 Authorization 헤더를 검증해 위변조된 uid 사용을 차단한다.
 */
import type { NextRequest } from "next/server";
import { getAdminAuth, getAdminDb } from "./firebase-admin";

export interface AuthedUser {
  uid: string;
  email?: string;
}

const SESSION_COOKIE_NAME = "__session";

/**
 * 우선 Authorization: Bearer <idToken> 헤더로 검증하고,
 * 없으면 httpOnly 세션 쿠키(__session)로 폴백해 검증한다.
 * 둘 다 없거나 유효하지 않으면 throw — 호출부에서 401/403 응답 처리.
 *
 * 세션 쿠키 폴백이 필요한 이유: PWA 클라이언트가 콜드부트 직후
 * Firebase SDK 복원이 끝나기 전에 API를 호출하는 경우, 또는
 * 쿠키 기반 자동 복구 직전에 첫 요청이 새는 케이스를 막기 위함.
 */
export async function verifyRequestUser(request: NextRequest): Promise<AuthedUser> {
  const header = request.headers.get("authorization") || request.headers.get("Authorization");
  if (header && header.startsWith("Bearer ")) {
    const token = header.slice(7).trim();
    if (token) {
      try {
        const decoded = await getAdminAuth().verifyIdToken(token);
        return { uid: decoded.uid, email: decoded.email };
      } catch {
        // 헤더 검증 실패 시 쿠키 폴백 시도
      }
    }
  }

  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (cookie) {
    try {
      const decoded = await getAdminAuth().verifySessionCookie(cookie, true);
      return { uid: decoded.uid, email: decoded.email };
    } catch {
      throw new AuthError(401, "세션이 만료되었습니다. 다시 로그인해주세요.");
    }
  }

  throw new AuthError(401, "인증 정보가 필요합니다.");
}

/**
 * 사용자가 해당 세션의 참여자인지 확인. 아니면 403.
 */
export async function assertSessionParticipant(
  uid: string,
  sessionId: string
): Promise<void> {
  if (!sessionId) throw new AuthError(400, "sessionId가 필요합니다.");
  const snap = await getAdminDb().doc(`sessions/${sessionId}`).get();
  if (!snap.exists) throw new AuthError(404, "세션을 찾을 수 없습니다.");
  const data = snap.data();
  const participants: unknown = data?.participants;
  if (!Array.isArray(participants) || !participants.includes(uid)) {
    throw new AuthError(403, "이 세션에 접근 권한이 없습니다.");
  }
}

export class AuthError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "AuthError";
  }
}
