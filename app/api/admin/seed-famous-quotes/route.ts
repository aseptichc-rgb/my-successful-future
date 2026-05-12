/**
 * POST /api/admin/seed-famous-quotes
 *
 * `lib/famousQuotesSeed.ts` 의 시드를 Firestore `famousQuotes` 컬렉션에 idempotent 로 동기화한다.
 * - 같은 id 가 있으면 text/author/category 등을 덮어쓰고 updatedAt 만 갱신.
 * - 시드에 없는 기존 문서는 건드리지 않는다 (어드민이 손으로 추가한 것 보호).
 *
 * 인증: Authorization: Bearer <idToken>, ADMIN_EMAILS 에 등록된 이메일만 통과.
 */
import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import { isAdminEmail } from "@/lib/tokenUsage";
import { FAMOUS_QUOTES_SEED } from "@/lib/famousQuotesSeed";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const FIRESTORE_BATCH_LIMIT = 400; // Firestore 한 batch 당 500 op 안전 마진

export async function POST(req: NextRequest) {
  // 1. 인증
  const header = req.headers.get("authorization") || "";
  if (!header.startsWith("Bearer ")) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }
  const token = header.slice(7).trim();
  let email: string | undefined;
  try {
    const decoded = await getAdminAuth().verifyIdToken(token);
    email = decoded.email;
  } catch {
    return NextResponse.json({ error: "유효하지 않은 토큰입니다." }, { status: 401 });
  }
  if (!isAdminEmail(email)) {
    return NextResponse.json({ error: "어드민 권한이 없습니다." }, { status: 403 });
  }

  // 2. idempotent 시드 적용
  try {
    const db = getAdminDb();
    const now = Timestamp.now();
    let written = 0;

    for (let i = 0; i < FAMOUS_QUOTES_SEED.length; i += FIRESTORE_BATCH_LIMIT) {
      const chunk = FAMOUS_QUOTES_SEED.slice(i, i + FIRESTORE_BATCH_LIMIT);
      const batch = db.batch();
      for (const seed of chunk) {
        const ref = db.collection("famousQuotes").doc(seed.id);
        batch.set(
          ref,
          {
            id: seed.id,
            text: seed.text,
            author: seed.author ?? null,
            category: seed.category,
            language: seed.language,
            tags: seed.tags ?? [],
            // 원문(원어) — 시드에 명시된 경우만 채우고, 없으면 null 로 명시 저장해
            // 시드에서 제거된 항목이 Firestore 에 잔존하지 않도록 한다.
            originalText: seed.originalText ?? null,
            originalLang: seed.originalLang ?? null,
            active: true,
            updatedAt: now,
            createdAt: now, // merge:true 라 첫 생성 때만 의미 있음
          },
          { merge: true }
        );
        written += 1;
      }
      await batch.commit();
    }

    return NextResponse.json({ ok: true, written, total: FAMOUS_QUOTES_SEED.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[seed-famous-quotes] 실패:", msg);
    return NextResponse.json({ error: "시드 동기화에 실패했습니다." }, { status: 500 });
  }
}
