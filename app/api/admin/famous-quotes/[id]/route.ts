/**
 * PATCH  /api/admin/famous-quotes/:id  — 수정 (부분 업데이트)
 * DELETE /api/admin/famous-quotes/:id  — 삭제
 *
 * 인증: ADMIN_EMAILS 등록 이메일만 통과.
 */
import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import { isAdminEmail } from "@/lib/tokenUsage";
import type { FamousQuoteCategory, FamousQuoteLang } from "@/types";

export const dynamic = "force-dynamic";

const ALLOWED_CATEGORIES: ReadonlyArray<FamousQuoteCategory> = [
  "philosophy",
  "entrepreneur",
  "classic",
  "leader",
  "scientist",
  "literature",
  "personal",
];

const TEXT_MIN = 5;
const TEXT_MAX = 280;
const AUTHOR_MAX = 60;
const TAG_MAX = 30;
const TAGS_MAX_COUNT = 8;

async function assertAdmin(req: NextRequest): Promise<NextResponse | null> {
  const header = req.headers.get("authorization") || "";
  if (!header.startsWith("Bearer ")) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }
  try {
    const decoded = await getAdminAuth().verifyIdToken(header.slice(7).trim());
    if (!isAdminEmail(decoded.email)) {
      return NextResponse.json({ error: "어드민 권한이 없습니다." }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: "유효하지 않은 토큰입니다." }, { status: 401 });
  }
  return null;
}

interface PatchBody {
  text?: unknown;
  author?: unknown;
  category?: unknown;
  language?: unknown;
  tags?: unknown;
  active?: unknown;
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const denied = await assertAdmin(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "id 누락" }, { status: 400 });

  let body: PatchBody = {};
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "JSON body 가 필요합니다." }, { status: 400 });
  }

  const update: Record<string, unknown> = { updatedAt: Timestamp.now() };

  if (body.text !== undefined) {
    if (typeof body.text !== "string") {
      return NextResponse.json({ error: "text 형식 오류" }, { status: 400 });
    }
    const t = body.text.trim();
    if (t.length < TEXT_MIN || t.length > TEXT_MAX) {
      return NextResponse.json(
        { error: `text 는 ${TEXT_MIN}~${TEXT_MAX}자여야 합니다.` },
        { status: 400 },
      );
    }
    update.text = t;
  }
  if (body.author !== undefined) {
    if (body.author === null || body.author === "") {
      update.author = null;
    } else if (typeof body.author === "string") {
      update.author = body.author.trim().slice(0, AUTHOR_MAX);
    } else {
      return NextResponse.json({ error: "author 형식 오류" }, { status: 400 });
    }
  }
  if (body.category !== undefined) {
    if (!ALLOWED_CATEGORIES.includes(body.category as FamousQuoteCategory)) {
      return NextResponse.json({ error: "category 가 올바르지 않습니다." }, { status: 400 });
    }
    update.category = body.category;
  }
  if (body.language !== undefined) {
    const lang: FamousQuoteLang = body.language === "en" ? "en" : "ko";
    update.language = lang;
  }
  if (body.tags !== undefined) {
    if (!Array.isArray(body.tags)) {
      return NextResponse.json({ error: "tags 는 배열" }, { status: 400 });
    }
    update.tags = body.tags
      .filter((t): t is string => typeof t === "string")
      .map((t) => t.trim())
      .filter((t) => t.length > 0 && t.length <= TAG_MAX)
      .slice(0, TAGS_MAX_COUNT);
  }
  if (body.active !== undefined) {
    update.active = body.active === true;
  }

  try {
    const ref = getAdminDb().collection("famousQuotes").doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ error: "찾을 수 없습니다." }, { status: 404 });
    }
    await ref.update(update);
    const updated = await ref.get();
    return NextResponse.json({ item: updated.data() });
  } catch (err) {
    console.error("[admin/famous-quotes PATCH] 실패:", err);
    return NextResponse.json({ error: "수정에 실패했습니다." }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const denied = await assertAdmin(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "id 누락" }, { status: 400 });
  try {
    await getAdminDb().collection("famousQuotes").doc(id).delete();
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[admin/famous-quotes DELETE] 실패:", err);
    return NextResponse.json({ error: "삭제에 실패했습니다." }, { status: 500 });
  }
}
