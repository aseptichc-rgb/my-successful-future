/**
 * GET  /api/admin/famous-quotes        — 전체 목록
 * POST /api/admin/famous-quotes        — 새 명언 추가
 *
 * 인증: ADMIN_EMAILS 등록 이메일만 통과.
 */
import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import { isAdminEmail } from "@/lib/tokenUsage";
import type { FamousQuote, FamousQuoteCategory, FamousQuoteLang } from "@/types";

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

interface CreateBody {
  text?: unknown;
  author?: unknown;
  category?: unknown;
  language?: unknown;
  tags?: unknown;
  active?: unknown;
}

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

function validateAndNormalize(body: CreateBody): {
  text: string;
  author: string | null;
  category: FamousQuoteCategory;
  language: FamousQuoteLang;
  tags: string[];
  active: boolean;
} | { error: string } {
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (text.length < TEXT_MIN || text.length > TEXT_MAX) {
    return { error: `text 는 ${TEXT_MIN}~${TEXT_MAX}자여야 합니다.` };
  }
  const authorRaw = typeof body.author === "string" ? body.author.trim() : "";
  const author = authorRaw.length > 0 ? authorRaw.slice(0, AUTHOR_MAX) : null;

  const category = body.category as FamousQuoteCategory;
  if (!ALLOWED_CATEGORIES.includes(category)) {
    return { error: "category 가 올바르지 않습니다." };
  }

  const language: FamousQuoteLang = body.language === "en" ? "en" : "ko";

  const tagsInput = Array.isArray(body.tags) ? body.tags : [];
  const tags = tagsInput
    .filter((t): t is string => typeof t === "string")
    .map((t) => t.trim())
    .filter((t) => t.length > 0 && t.length <= TAG_MAX)
    .slice(0, TAGS_MAX_COUNT);

  const active = body.active === false ? false : true;

  return { text, author, category, language, tags, active };
}

export async function GET(req: NextRequest) {
  const denied = await assertAdmin(req);
  if (denied) return denied;
  try {
    const snap = await getAdminDb().collection("famousQuotes").get();
    const items = snap.docs.map((d) => d.data() as FamousQuote);
    items.sort((a, b) => a.id.localeCompare(b.id));
    return NextResponse.json({ items, count: items.length });
  } catch (err) {
    console.error("[admin/famous-quotes GET] 실패:", err);
    return NextResponse.json({ error: "목록 조회에 실패했습니다." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const denied = await assertAdmin(req);
  if (denied) return denied;
  let body: CreateBody = {};
  try {
    body = (await req.json()) as CreateBody;
  } catch {
    return NextResponse.json({ error: "JSON body 가 필요합니다." }, { status: 400 });
  }
  const v = validateAndNormalize(body);
  if ("error" in v) {
    return NextResponse.json({ error: v.error }, { status: 400 });
  }

  try {
    const now = Timestamp.now();
    const ref = getAdminDb().collection("famousQuotes").doc();
    const item: FamousQuote = {
      id: ref.id,
      text: v.text,
      author: v.author ?? undefined,
      category: v.category,
      language: v.language,
      tags: v.tags,
      active: v.active,
      createdAt: now as unknown,
      updatedAt: now as unknown,
    };
    await ref.set(item);
    return NextResponse.json({ item });
  } catch (err) {
    console.error("[admin/famous-quotes POST] 실패:", err);
    return NextResponse.json({ error: "추가에 실패했습니다." }, { status: 500 });
  }
}
