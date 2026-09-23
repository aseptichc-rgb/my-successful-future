/**
 * POST /api/feedback — "만든 사람에게 한마디" 저장.
 *
 * body: { text: string (≤ FEEDBACK_MAX_LEN), contactOk?: boolean, locale?: string, platform?: string }
 *
 * - `feedback` 컬렉션(server-only)에 1건 저장. 이메일은 사용자가 "답장 받아도 괜찮아요" 를
 *   켰을 때만 토큰에서 꺼내 함께 저장한다 — 동의 없는 연락처 수집을 하지 않는다.
 * - 운영자에게 텔레그램으로 즉시 전달(lib/telegramNotify). 실패해도 저장은 유효하다.
 * - feedback_submitted 이벤트를 남긴다(lib/events).
 * - 한도: feedback (lib/constants/quota.ts).
 */
import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase-admin";
import { verifyRequestUser, AuthError } from "@/lib/authServer";
import { enforceQuota, QuotaExceededError } from "@/lib/quota";
import { logEvent } from "@/lib/events";
import { notifyTelegram } from "@/lib/telegramNotify";
import { isEventPlatform } from "@/lib/constants/events";
import { FEEDBACK_MAX_LEN } from "@/lib/feedbackCard";
import { isLocale } from "@/lib/i18n/types";

export const maxDuration = 15;

/** 텔레그램 메시지에 싣는 본문 길이 — 알림은 미리보기, 전문은 Firestore. */
const TELEGRAM_PREVIEW_LEN = 300;

interface PostBody {
  text?: unknown;
  contactOk?: unknown;
  locale?: unknown;
  platform?: unknown;
}

export async function POST(request: NextRequest) {
  try {
    const me = await verifyRequestUser(request);

    let body: PostBody = {};
    try {
      body = (await request.json()) as PostBody;
    } catch {
      // 빈/깨진 바디 → 아래 검증에서 400.
    }

    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (!text) {
      return NextResponse.json({ error: "Please write something first." }, { status: 400 });
    }
    if (text.length > FEEDBACK_MAX_LEN) {
      return NextResponse.json({ error: "That's a bit too long." }, { status: 400 });
    }
    const contactOk = body.contactOk === true;
    const locale = isLocale(body.locale) ? body.locale : null;
    const platform = isEventPlatform(body.platform) ? body.platform : null;

    await enforceQuota(me.uid, "feedback");

    const db = getAdminDb();
    const ref = await db.collection("feedback").add({
      uid: me.uid,
      text,
      contactOk,
      // 동의한 경우에만 연락처를 남긴다.
      email: contactOk && me.email ? me.email : null,
      locale,
      platform,
      createdAt: FieldValue.serverTimestamp(),
    });

    // 운영자 알림과 이벤트 기록은 병렬·best-effort — 둘 다 응답을 막지 않는다.
    const preview = text.length > TELEGRAM_PREVIEW_LEN ? `${text.slice(0, TELEGRAM_PREVIEW_LEN)}…` : text;
    await Promise.all([
      notifyTelegram(
        [
          "💬 새 피드백",
          `플랫폼: ${platform ?? "?"} · 언어: ${locale ?? "?"} · 답장 OK: ${contactOk ? "예" : "아니오"}`,
          contactOk && me.email ? `연락처: ${me.email}` : null,
          "",
          preview,
        ]
          .filter((line): line is string => line !== null)
          .join("\n"),
      ),
      logEvent({ uid: me.uid, name: "feedback_submitted", props: { contactOk }, platform }),
    ]);

    return NextResponse.json({ ok: true, id: ref.id });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    if (err instanceof QuotaExceededError) {
      return NextResponse.json({ error: err.message }, { status: 429 });
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[feedback POST] 실패:", msg);
    return NextResponse.json({ error: "Couldn't send your feedback." }, { status: 500 });
  }
}
