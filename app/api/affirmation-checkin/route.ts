/**
 * "성공한 나의 모습" 다짐 따라쓰기 체크인 API.
 *
 * - POST { ymd?, entries: [{ index, text }] } : 사용자가 실제로 적은 줄만 인덱스와 함께 제출.
 *   오늘의 focus 줄(서버가 회전으로 결정)이 일치하면 체크인 성공 + 스트릭 갱신,
 *   전량을 적어 전부 일치하면 depth="full" + 정체성 증거 보너스.
 *   focus 가 어긋나면 200 + matched:false (쓰기 없음).
 * - POST { ymd?, texts: string[] } : 레거시 전량 제출 — 배열 순서를 인덱스로 해석한다.
 *   구버전 클라이언트/위젯 딥링크 호환을 위해 계속 수용한다.
 *
 * 한도: affirmationCheckin (`lib/constants/quota.ts`) — 오타 후 재시도까지 여유 있게 12회/일.
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyRequestUser, AuthError } from "@/lib/authServer";
import { isValidYmd } from "@/lib/dailyMotivation";
import {
  checkinAffirmations,
  todayKstYmd,
  AffirmationCheckinError,
  type CheckinEntry,
} from "@/lib/affirmationCheckin";
import { enforceQuota, QuotaExceededError } from "@/lib/quota";

export const maxDuration = 10;

const MAX_TEXTS = 10;
const MAX_TEXT_LEN_PAYLOAD = 240; // 60자 * 4 (multibyte/whitespace 여유)

interface PostBody {
  ymd?: string;
  entries?: unknown;
  texts?: unknown;
}

/** 검증 실패는 400 메시지로, 성공은 정규화된 entries 로. */
type ParseResult = { ok: true; entries: CheckinEntry[] } | { ok: false; error: string };

/**
 * entries(신규) 또는 texts(레거시) 를 단일 형태로 정규화한다.
 * 본문 내용은 검증에만 쓰고 어떤 경우에도 로그에 남기지 않는다.
 */
function parseEntries(body: PostBody): ParseResult {
  const raw = body.entries;
  if (Array.isArray(raw)) {
    if (raw.length === 0 || raw.length > MAX_TEXTS) {
      return { ok: false, error: `You need 1-${MAX_TEXTS} affirmations.` };
    }
    const entries: CheckinEntry[] = [];
    const seen = new Set<number>();
    for (const item of raw) {
      if (typeof item !== "object" || item === null) {
        return { ok: false, error: "The affirmation items are not in a valid format." };
      }
      const { index, text } = item as { index?: unknown; text?: unknown };
      if (!Number.isInteger(index) || (index as number) < 0 || (index as number) >= MAX_TEXTS) {
        return { ok: false, error: "The affirmation index is out of range." };
      }
      if (seen.has(index as number)) {
        return { ok: false, error: "The same affirmation was submitted twice." };
      }
      if (typeof text !== "string") {
        return { ok: false, error: "Every affirmation item must be a string." };
      }
      if (text.length > MAX_TEXT_LEN_PAYLOAD) {
        return { ok: false, error: "One of the affirmation items is too long." };
      }
      seen.add(index as number);
      entries.push({ index: index as number, text });
    }
    return { ok: true, entries };
  }

  // ── 레거시: texts 배열 순서를 인덱스로 해석 ──
  const legacy = body.texts;
  if (!Array.isArray(legacy)) {
    return { ok: false, error: "An array of affirmation texts is required." };
  }
  if (legacy.length === 0 || legacy.length > MAX_TEXTS) {
    return { ok: false, error: `You need 1-${MAX_TEXTS} affirmations.` };
  }
  const entries: CheckinEntry[] = [];
  for (let i = 0; i < legacy.length; i++) {
    const text = legacy[i];
    if (typeof text !== "string") {
      return { ok: false, error: "Every affirmation item must be a string." };
    }
    if (text.length > MAX_TEXT_LEN_PAYLOAD) {
      return { ok: false, error: "One of the affirmation items is too long." };
    }
    entries.push({ index: i, text });
  }
  return { ok: true, entries };
}

export async function POST(request: NextRequest) {
  try {
    // 무료 티어 유지 기능 — 매일의 다짐 체크인은 미결제 사용자에게도 계속 열어둔다.
    // (결제 유도는 AI 생성 기능에서만 — lib/constants/quota.ts 의 티어 정책 주석 참고.)
    const me = await verifyRequestUser(request);

    let body: PostBody = {};
    try {
      body = (await request.json()) as PostBody;
    } catch {
      // 빈 바디 → 아래 검증에서 400.
    }

    const ymd = typeof body.ymd === "string" && isValidYmd(body.ymd) ? body.ymd : todayKstYmd();
    const parsed = parseEntries(body);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    await enforceQuota(me.uid, "affirmationCheckin");

    const result = await checkinAffirmations({ uid: me.uid, ymd, entries: parsed.entries });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    if (err instanceof QuotaExceededError) {
      return NextResponse.json({ error: err.message }, { status: 429 });
    }
    if (err instanceof AffirmationCheckinError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[affirmation-checkin POST] 실패:", msg);
    return NextResponse.json({ error: "Couldn't save your check-in." }, { status: 500 });
  }
}
