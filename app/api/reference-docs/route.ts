import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase-admin";
import { verifyRequestUser, AuthError } from "@/lib/authServer";
import { parseGoogleDocId, validateGoogleDoc } from "@/lib/googleDocs";

export const runtime = "nodejs";

const MAX_USER_DOCS = 10;
const MAX_TITLE_LENGTH = 100;
const MAX_PERSONA_SCOPE = 20;
const MAX_PERSONA_ID_LENGTH = 80;

/**
 * 클라이언트가 보낸 personaIds 배열을 안전하게 정규화한다.
 * - 문자열 아닌 항목 제거, 공백 trim, 빈 문자열 제거
 * - 길이 제한 및 최대 개수 제한
 * - 중복 제거
 * 반환값이 빈 배열이면 "전체 페르소나 적용" 으로 해석한다.
 */
function sanitizePersonaIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const trimmed = item.trim().slice(0, MAX_PERSONA_ID_LENGTH);
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
    if (result.length >= MAX_PERSONA_SCOPE) break;
  }
  return result;
}

/**
 * GET: 현재 사용자가 등록한 Google Docs 참조 링크 목록.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await verifyRequestUser(request);
    const db = getAdminDb();
    const snap = await db
      .collection("userReferenceDocs")
      .where("uid", "==", user.uid)
      .get();
    const items = snap.docs
      .map((d) => {
        const data = d.data();
        return {
          id: d.id,
          googleDocId: String(data.googleDocId || ""),
          title: String(data.title || ""),
          active: Boolean(data.active),
          personaIds: Array.isArray(data.personaIds) ? data.personaIds.map(String) : [],
          createdAt: data.createdAt?.toMillis?.() ?? null,
        };
      })
      .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
    return NextResponse.json({ items });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("GET /api/reference-docs error:", err);
    return NextResponse.json({ error: "조회 실패" }, { status: 500 });
  }
}

/**
 * POST: 새 Google Docs 링크 등록. 공개 공유 여부 검증 후 저장.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await verifyRequestUser(request);
    const body = (await request.json()) as { url?: string; title?: string; personaIds?: unknown };
    const rawUrl = String(body.url || "");
    const personaIds = sanitizePersonaIds(body.personaIds);
    const docId = parseGoogleDocId(rawUrl);
    if (!docId) {
      return NextResponse.json(
        { error: "올바른 Google Docs 링크 또는 문서 ID 가 아닙니다." },
        { status: 400 }
      );
    }

    const db = getAdminDb();

    // 중복 체크
    const dupSnap = await db
      .collection("userReferenceDocs")
      .where("uid", "==", user.uid)
      .where("googleDocId", "==", docId)
      .limit(1)
      .get();
    if (!dupSnap.empty) {
      return NextResponse.json({ error: "이미 등록된 문서입니다." }, { status: 409 });
    }

    // 개수 상한
    const countSnap = await db
      .collection("userReferenceDocs")
      .where("uid", "==", user.uid)
      .count()
      .get();
    if (countSnap.data().count >= MAX_USER_DOCS) {
      return NextResponse.json(
        { error: `참조 문서는 최대 ${MAX_USER_DOCS}개까지 등록할 수 있습니다.` },
        { status: 409 }
      );
    }

    // 공개 공유 여부 + 접근 가능 여부 검증 (+ 제목 추출)
    const check = await validateGoogleDoc(docId);
    if (!check.ok) {
      return NextResponse.json(
        { error: `문서 접근 실패: ${check.error}` },
        { status: 400 }
      );
    }

    const providedTitle = String(body.title || "").trim().slice(0, MAX_TITLE_LENGTH);
    const title = providedTitle || check.title;

    const docRef = await db.collection("userReferenceDocs").add({
      uid: user.uid,
      googleDocId: docId,
      title,
      active: true,
      personaIds,
      createdAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({
      id: docRef.id,
      googleDocId: docId,
      title,
      active: true,
      personaIds,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("POST /api/reference-docs error:", err);
    return NextResponse.json({ error: "등록 실패" }, { status: 500 });
  }
}
