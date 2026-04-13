import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase-admin";
import { verifyRequestUser, assertSessionParticipant, AuthError } from "@/lib/authServer";
import {
  extractTextFromFile,
  ExtractError,
  MAX_DOCS_PER_SESSION,
  MAX_FILE_BYTES,
} from "@/lib/documentExtract";
import type { SessionDocumentScope } from "@/types";

export const maxDuration = 60;
export const runtime = "nodejs"; // pdf-parse 는 Node 런타임 필요

export async function POST(request: NextRequest) {
  try {
    // 1) 인증
    const user = await verifyRequestUser(request);

    // 2) multipart 파싱
    const form = await request.formData();
    const file = form.get("file");
    const sessionId = String(form.get("sessionId") || "");
    const scopeRaw = String(form.get("scope") || "session") as SessionDocumentScope;
    const ownerName = String(form.get("ownerName") || "");
    const scope: SessionDocumentScope = scopeRaw === "message" ? "message" : "session";

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file 필드가 필요합니다." }, { status: 400 });
    }
    if (!sessionId) {
      return NextResponse.json({ error: "sessionId가 필요합니다." }, { status: 400 });
    }
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        { error: `파일 크기는 ${Math.round(MAX_FILE_BYTES / 1024 / 1024)}MB 이하여야 합니다.` },
        { status: 413 }
      );
    }

    // 3) 세션 참여자 확인 (서버에서 직접 검증 — 클라이언트 신뢰 X)
    await assertSessionParticipant(user.uid, sessionId);

    // 4) 활성 문서 개수 상한
    const db = getAdminDb();

    // 세션 participants 를 문서에 비정규화 저장 — 보안 규칙이 cross-doc get() 없이
    // resource.data.participants 만 보면 되므로 onSnapshot 쿼리 권한 평가가 안정적.
    const sessionSnap = await db.doc(`sessions/${sessionId}`).get();
    const sessionParticipants = Array.isArray(sessionSnap.data()?.participants)
      ? (sessionSnap.data()!.participants as string[])
      : [user.uid];
    const activeSnap = await db
      .collection("sessionDocuments")
      .where("sessionId", "==", sessionId)
      .where("active", "==", true)
      .count()
      .get();
    if (activeSnap.data().count >= MAX_DOCS_PER_SESSION) {
      return NextResponse.json(
        {
          error: `세션당 활성 문서는 최대 ${MAX_DOCS_PER_SESSION}개입니다. 기존 문서를 비활성화 후 다시 시도하세요.`,
        },
        { status: 409 }
      );
    }

    // 5) 텍스트 추출 + sanitize
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const result = await extractTextFromFile(buffer, file.name, file.type || "");

    // 6) Firestore 저장 (Admin SDK 로 — 클라이언트 규칙 우회 가능하지만 우리가 검증 완료)
    const safeFileName = file.name.slice(0, 200).replace(/[\u0000-\u001F]/g, "");
    const docRef = await db.collection("sessionDocuments").add({
      sessionId,
      participants: sessionParticipants,
      ownerUid: user.uid,
      ownerName: ownerName.slice(0, 50) || null,
      fileName: safeFileName,
      mime: result.mime,
      sizeBytes: buffer.length,
      charCount: result.charCount,
      truncated: result.truncated,
      scope,
      active: true,
      extractedText: result.text,
      createdAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({
      docId: docRef.id,
      fileName: safeFileName,
      mime: result.mime,
      sizeBytes: buffer.length,
      charCount: result.charCount,
      truncated: result.truncated,
      scope,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    if (err instanceof ExtractError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Document upload error:", msg);
    return NextResponse.json({ error: "업로드 중 오류가 발생했습니다." }, { status: 500 });
  }
}
