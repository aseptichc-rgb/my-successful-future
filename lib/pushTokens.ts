/**
 * 외부 Push 토큰 유틸 (Claude Code 등 외부 클라이언트가 채팅방에 결과물을 보낼 때 사용).
 * - 발급 시 32바이트 무작위 → base64url 인코딩
 * - DB 에는 SHA-256 해시만 저장
 * - 검증 시 해시 비교 (일정 시간 비교 — Node crypto.timingSafeEqual)
 */
import { randomBytes, createHash, timingSafeEqual } from "node:crypto";

export const TOKEN_PREFIX = "mfp_";

export interface IssuedToken {
  /** 평문 토큰 (한 번만 반환). */
  token: string;
  /** 저장용 해시. */
  hash: string;
}

/** 평문 토큰 + 해시 발급. */
export function generateToken(): IssuedToken {
  const raw = randomBytes(32).toString("base64url");
  const token = `${TOKEN_PREFIX}${raw}`;
  return { token, hash: hashToken(token) };
}

/** SHA-256 해시 (hex). */
export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** 일정 시간 비교 — 타이밍 공격 방지. */
export function safeEqual(a: string, b: string): boolean {
  try {
    const ab = Buffer.from(a, "hex");
    const bb = Buffer.from(b, "hex");
    if (ab.length !== bb.length) return false;
    return timingSafeEqual(ab, bb);
  } catch {
    return false;
  }
}

/** 표면적 유효성 (DB 조회 전 빠른 거절). */
export function looksLikeToken(value: string): boolean {
  return (
    typeof value === "string" &&
    value.startsWith(TOKEN_PREFIX) &&
    value.length >= TOKEN_PREFIX.length + 20 &&
    value.length <= 200
  );
}
