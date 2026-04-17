/**
 * POST /api/persona-brief
 *
 * 채팅방에 최초 진입할 때 호출한다. 사용자가 해당 페르소나에 대해
 * personaSchedules 를 등록해뒀다면, 당일 실시간 브리프가 아직 생성되지 않은 경우에
 * runKeywordAlert 로 뉴스 브리프를 한 번 생성해 메시지로 게시한다.
 *
 * 인증: Firebase ID 토큰 (Authorization: Bearer <token>) + 세션 참여 검증.
 * 같은 날 두 번째 호출부터는 no-op ("already-today") — 비용 폭증 방지.
 */

import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { runKeywordAlert } from "@/lib/keyword-alert-runner";
import { getAdminDb } from "@/lib/firebase-admin";
import { verifyRequestUser, assertSessionParticipant, AuthError } from "@/lib/authServer";
import { resolvePersona, postBriefMessages, kstYmd } from "@/lib/persona-brief-poster";
import type { PersonaSchedule } from "@/types";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

interface RequestBody {
  sessionId?: string;
  personaId?: string;
}

type BriefStatus =
  | "no-config"
  | "disabled"
  | "already-today"
  | "no-persona"
  | "no-news"
  | "fired";

export async function POST(request: NextRequest) {
  let uid: string;
  try {
    const user = await verifyRequestUser(request);
    uid = user.uid;
  } catch (err) {
    const status = err instanceof AuthError ? err.status : 401;
    const message = err instanceof Error ? err.message : "unauthorized";
    return NextResponse.json({ error: message }, { status });
  }

  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const sessionId = body.sessionId?.trim();
  const personaId = body.personaId?.trim();
  if (!sessionId || !personaId) {
    return NextResponse.json(
      { error: "sessionId와 personaId는 필수입니다." },
      { status: 400 }
    );
  }

  try {
    await assertSessionParticipant(uid, sessionId);
  } catch (err) {
    const status = err instanceof AuthError ? err.status : 403;
    const message = err instanceof Error ? err.message : "forbidden";
    return NextResponse.json({ error: message }, { status });
  }

  const db = getAdminDb();
  const scheduleRef = db
    .collection("users")
    .doc(uid)
    .collection("personaSchedules")
    .doc(personaId);

  try {
    const scheduleSnap = await scheduleRef.get();
    if (!scheduleSnap.exists) {
      return NextResponse.json({ ok: true, status: "no-config" as BriefStatus });
    }
    const schedule = scheduleSnap.data() as PersonaSchedule;
    if (!schedule.enabled) {
      return NextResponse.json({ ok: true, status: "disabled" as BriefStatus });
    }
    const keywords = schedule.keywords ?? [];
    if (keywords.length === 0) {
      return NextResponse.json({ ok: true, status: "no-config" as BriefStatus });
    }

    const todayYmd = kstYmd();
    if (schedule.lastLazyBriefYmd === todayYmd) {
      return NextResponse.json({ ok: true, status: "already-today" as BriefStatus });
    }

    const persona = await resolvePersona(uid, personaId);
    if (!persona) {
      return NextResponse.json({ ok: true, status: "no-persona" as BriefStatus });
    }

    const result = await runKeywordAlert(keywords);
    // 재시도 폭주 방지: 뉴스 없음도 당일 소비 처리한다. 실패만 ymd 미기록으로 남긴다.
    await scheduleRef.set(
      { lastLazyBriefYmd: todayYmd, updatedAt: FieldValue.serverTimestamp() },
      { merge: true }
    );

    if (!result.hasNews || !result.content) {
      return NextResponse.json({ ok: true, status: "no-news" as BriefStatus });
    }

    await postBriefMessages({
      sessionId,
      persona,
      content: result.content,
      sources: result.sources ?? [],
      matchedKeyword: result.matchedKeyword,
      kind: "lazy",
    });

    return NextResponse.json({ ok: true, status: "fired" as BriefStatus });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[persona-brief] 실패:", message);
    return NextResponse.json(
      { error: `실시간 브리프 생성 오류: ${message}` },
      { status: 500 }
    );
  }
}
