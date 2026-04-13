/**
 * 외부 클라이언트(Claude Code 등)가 채팅방에 결과물을 푸시하는 엔드포인트.
 *
 * 인증: Firebase Auth 가 아닌, 사전에 발급된 push 토큰으로 인증.
 *   - X-Push-Token 헤더 또는 ?token= 쿼리스트링 (헤더 권장)
 *
 * 동작:
 *   1) 토큰 검증 (해시 매칭, 만료/폐기/사용량 확인)
 *   2) 본문(JSON 또는 multipart) 파싱
 *   3) 메시지를 messages 컬렉션에 추가 (assistant 역할, 외부 봇 페르소나 표시)
 *   4) (옵션) attachAsDocument=true 면 sessionDocuments 에도 등록 → AI 컨텍스트에 자동 반영
 *
 * 보안:
 *   - 평문 토큰 비교는 timing-safe
 *   - 본문 길이 상한 (메시지 8KB, 첨부 텍스트 50KB)
 *   - 제어문자 제거
 *   - 토큰별 사용량 카운트 + maxUses 강제
 *   - 폐기된 토큰은 즉시 거절
 */

import { NextRequest, NextResponse } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase-admin";
import { hashToken, looksLikeToken, safeEqual } from "@/lib/pushTokens";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_MESSAGE_CHARS = 8_000;
const MAX_DOC_CHARS = 50_000;
const MAX_TITLE_CHARS = 200;
const MAX_LABEL_CHARS = 60;

function sanitize(text: string, maxChars: number): { text: string; truncated: boolean } {
  const cleaned = text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
  if (cleaned.length <= maxChars) return { text: cleaned, truncated: false };
  return { text: cleaned.slice(0, maxChars), truncated: true };
}

interface ResolvedToken {
  ref: FirebaseFirestore.DocumentReference;
  data: FirebaseFirestore.DocumentData;
}

async function resolveToken(rawToken: string): Promise<ResolvedToken | null> {
  if (!looksLikeToken(rawToken)) return null;
  const expectedHash = hashToken(rawToken);
  const db = getAdminDb();
  const snap = await db
    .collection("pushTokens")
    .where("tokenHash", "==", expectedHash)
    .limit(1)
    .get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  const data = doc.data();
  // 추가로 timing-safe 비교 (where 절은 일반 비교지만 한 번 더 안전하게)
  if (!safeEqual(String(data.tokenHash || ""), expectedHash)) return null;
  return { ref: doc.ref, data };
}

function getTokenFromRequest(request: NextRequest): string {
  const header = request.headers.get("x-push-token");
  if (header && header.trim()) return header.trim();
  const q = request.nextUrl.searchParams.get("token");
  return (q || "").trim();
}

interface PushBody {
  title?: string;
  summary?: string;
  content: string;
  attachAsDocument?: boolean;
  fileName?: string;
  authorLabel?: string;
}

export async function POST(request: NextRequest) {
  try {
    const rawToken = getTokenFromRequest(request);
    if (!rawToken) {
      return NextResponse.json({ error: "X-Push-Token 헤더가 필요합니다." }, { status: 401 });
    }

    const resolved = await resolveToken(rawToken);
    if (!resolved) {
      return NextResponse.json({ error: "유효하지 않은 토큰입니다." }, { status: 401 });
    }
    const { ref: tokenRef, data: tokenData } = resolved;

    if (tokenData.revoked) {
      return NextResponse.json({ error: "폐기된 토큰입니다." }, { status: 403 });
    }
    const expiresAt = tokenData.expiresAt as Timestamp | undefined;
    if (expiresAt && expiresAt.toMillis() < Date.now()) {
      return NextResponse.json({ error: "만료된 토큰입니다." }, { status: 403 });
    }
    const useCount = Number(tokenData.useCount || 0);
    const maxUses = tokenData.maxUses as number | null | undefined;
    if (typeof maxUses === "number" && useCount >= maxUses) {
      return NextResponse.json({ error: "토큰 사용량을 모두 소진했습니다." }, { status: 429 });
    }

    const sessionId = String(tokenData.sessionId || "");
    const ownerName = String(tokenData.ownerName || "외부 작업물");
    const tokenLabel = String(tokenData.label || "");

    if (!sessionId) {
      return NextResponse.json({ error: "토큰의 세션 정보가 손상되었습니다." }, { status: 500 });
    }

    // 본문 파싱 (JSON 만 지원 — 단순/안전)
    const body = (await request.json()) as PushBody;
    if (!body || typeof body.content !== "string" || body.content.trim().length === 0) {
      return NextResponse.json({ error: "content 필드가 필요합니다." }, { status: 400 });
    }

    const title = sanitize(String(body.title || ""), MAX_TITLE_CHARS).text;
    const summary = sanitize(String(body.summary || ""), MAX_MESSAGE_CHARS).text;
    const authorLabel = sanitize(String(body.authorLabel || tokenLabel || ownerName), MAX_LABEL_CHARS).text;
    const attachAsDocument = body.attachAsDocument !== false; // 기본 true

    const db = getAdminDb();

    // 세션 participants 비정규화 — sessionDocuments 보안 규칙이 cross-doc get() 없이
    // resource.data.participants 만 보면 되도록.
    const sessionSnap = await db.doc(`sessions/${sessionId}`).get();
    const sessionParticipants = Array.isArray(sessionSnap.data()?.participants)
      ? (sessionSnap.data()!.participants as string[])
      : [];

    // 메시지 본문: 짧은 요약이면 그대로, 길면 head + "...전체는 첨부문서 참고" 형태
    const fullContent = sanitize(body.content, MAX_DOC_CHARS);
    const isLong = fullContent.text.length > 1500 || fullContent.truncated;
    const messageBodyParts: string[] = [];
    if (title) messageBodyParts.push(`📥 ${title}`);
    if (summary) messageBodyParts.push(summary);
    if (!summary && !isLong) messageBodyParts.push(fullContent.text);
    if (isLong) {
      const preview = fullContent.text.slice(0, 800);
      messageBodyParts.push(preview + (fullContent.text.length > 800 ? "\n…(전문은 첨부문서 참고)" : ""));
    }
    const messageContent = sanitize(messageBodyParts.join("\n\n"), MAX_MESSAGE_CHARS).text;

    const personaId = `ext-push:${tokenRef.id}`;
    const personaName = authorLabel || "외부 작업물";

    // 1) 메시지 작성
    const msgRef = await db.collection("messages").add({
      sessionId,
      role: "assistant",
      content: messageContent,
      sources: [],
      personaId,
      personaName,
      personaIcon: "📥",
      createdAt: FieldValue.serverTimestamp(),
    });

    // 2) 세션 lastMessage 갱신
    await db.collection("sessions").doc(sessionId).update({
      updatedAt: FieldValue.serverTimestamp(),
      lastMessage: messageContent.slice(0, 100),
      lastMessageAt: FieldValue.serverTimestamp(),
      lastMessageSenderName: personaName,
    }).catch(() => { /* 세션이 없을 수도 있음 — 메시지 작성은 이미 완료 */ });

    // 3) (옵션) 첨부문서로도 등록 → 다음 AI 응답 컨텍스트에 자동 포함
    let docId: string | undefined;
    if (attachAsDocument && fullContent.text.length > 0) {
      const fileName = sanitize(
        String(body.fileName || `${title || "외부작업물"}.md`),
        200
      ).text;
      const docRef = await db.collection("sessionDocuments").add({
        sessionId,
        participants: sessionParticipants,
        ownerUid: String(tokenData.ownerUid || ""),
        ownerName: personaName,
        fileName,
        mime: "text/markdown",
        sizeBytes: Buffer.byteLength(fullContent.text, "utf8"),
        charCount: fullContent.text.length,
        truncated: fullContent.truncated,
        scope: "session",
        active: true,
        extractedText: fullContent.text,
        createdAt: FieldValue.serverTimestamp(),
      });
      docId = docRef.id;
    }

    // 4) 토큰 사용량 갱신
    await tokenRef.update({
      useCount: FieldValue.increment(1),
      lastUsedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({
      ok: true,
      messageId: msgRef.id,
      docId,
      truncated: fullContent.truncated,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("External push error:", msg);
    return NextResponse.json({ error: "푸시 처리 중 오류" }, { status: 500 });
  }
}
