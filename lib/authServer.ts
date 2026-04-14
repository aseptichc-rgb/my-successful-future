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

/**
 * Authorization: Bearer <idToken> 헤더에서 토큰을 검증하고 uid 반환.
 * 실패 시 throw — 호출부에서 401/403 응답 처리.
 */
export async function verifyRequestUser(request: NextRequest): Promise<AuthedUser> {
  const header = request.headers.get("authorization") || request.headers.get("Authorization");
  if (!header || !header.startsWith("Bearer ")) {
    throw new AuthError(401, "Authorization 헤더가 필요합니다.");
  }
  const token = header.slice(7).trim();
  if (!token) {
    throw new AuthError(401, "토큰이 비어 있습니다.");
  }
  try {
    const decoded = await getAdminAuth().verifyIdToken(token);
    return { uid: decoded.uid, email: decoded.email };
  } catch {
    throw new AuthError(401, "유효하지 않은 토큰입니다.");
  }
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
