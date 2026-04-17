/**
 * POST /api/collect-news
 *
 * Vercel Cron이 매시 정각에 호출. 모든 빌트인 페르소나(future-self 제외)에 대해
 * "오늘 도래했지만 아직 수집되지 않은 슬롯"이 있으면 수집을 실행한다.
 *
 * 인증: Vercel Cron이 보내는 Authorization: Bearer ${CRON_SECRET} 헤더 검증.
 * (개발 환경에서는 ?key=local 로도 호출 가능)
 *
 * 결과 요약은 본문에 JSON으로 반환 (Vercel 크론 로그에서 가시적).
 */

import { NextRequest, NextResponse } from "next/server";
import { collectForPersona } from "@/lib/personaNewsCollector";
import { runKeywordAlert } from "@/lib/keyword-alert-runner";
import { getAdminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import {
  KST_OFFSET_MINUTES,
  CRON_TOLERANCE_MINUTES,
} from "@/lib/constants/keyword-alert";
import { resolvePersona, postBriefMessages } from "@/lib/persona-brief-poster";
import type { BuiltinPersonaId, KeywordAlertConfig, ScheduledNewsSlot, NewsSource, PersonaSchedule } from "@/types";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const MS_PER_MINUTE = 60_000;

// 자동 수집 대상 (future-self는 사용자 텍스트에 의존하므로 자동 수집에서 제외)
const TARGET_PERSONAS: BuiltinPersonaId[] = [
  "default",
  "entrepreneur",
  "healthcare-expert",
  "fund-trader",
  "tech-cto",
  "policy-analyst",
];

function authorize(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  // 로컬/개발 편의: secret 미설정이면 통과
  if (!secret) return true;
  const auth = req.headers.get("authorization") || "";
  if (auth === `Bearer ${secret}`) return true;
  // Vercel Cron은 자동으로 위 헤더를 붙여줌
  const queryKey = req.nextUrl.searchParams.get("key");
  return queryKey === secret;
}

/** KST 기준 현재 분(0~1439) 과 YYYY-MM-DD */
function kstNow(): { minuteOfDay: number; ymd: string } {
  const now = new Date();
  const kst = new Date(now.getTime() + KST_OFFSET_MINUTES * MS_PER_MINUTE);
  const minuteOfDay = kst.getUTCHours() * 60 + kst.getUTCMinutes();
  const ymd = `${kst.getUTCFullYear()}-${String(kst.getUTCMonth() + 1).padStart(2, "0")}-${String(kst.getUTCDate()).padStart(2, "0")}`;
  return { minuteOfDay, ymd };
}

function parseHhmmToMinute(hhmm: string): number | null {
  const m = hhmm.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

interface ScheduledFireResult {
  sessionId: string;
  slotTime: string;
  status: "fired" | "no-news" | "skipped" | "error";
}

/**
 * 활성화된 모든 keywordAlerts 문서를 스캔해 도래한 슬롯을 발사한다.
 * - 발사 = runKeywordAlert + sessions 컬렉션에 assistant 메시지 추가 + slot.lastFiredYmd 갱신
 * - 일일 1회 (lastFiredYmd != today)
 */
async function processScheduledKeywordAlerts(): Promise<ScheduledFireResult[]> {
  const db = getAdminDb();
  const { minuteOfDay, ymd } = kstNow();
  const out: ScheduledFireResult[] = [];

  let snap;
  try {
    snap = await db
      .collection("keywordAlerts")
      .where("scheduledEnabled", "==", true)
      .get();
  } catch (err) {
    console.error("[collect-news] scheduled scan 쿼리 실패:", err);
    return out;
  }

  for (const docSnap of snap.docs) {
    const sessionId = docSnap.id;
    const data = docSnap.data() as KeywordAlertConfig;
    const slots: ScheduledNewsSlot[] = data.scheduledTimes ?? [];
    const keywords = data.keywords ?? [];
    if (slots.length === 0 || keywords.length === 0) continue;

    for (const slot of slots) {
      const slotMin = parseHhmmToMinute(slot.time);
      if (slotMin === null) continue;
      const diff = Math.abs(slotMin - minuteOfDay);
      if (diff > CRON_TOLERANCE_MINUTES) continue;
      if (slot.lastFiredYmd === ymd) continue;

      try {
        const result = await runKeywordAlert(keywords);
        if (!result.hasNews || !result.content) {
          out.push({ sessionId, slotTime: slot.time, status: "no-news" });
          // 뉴스가 없어도 이번 슬롯은 소비 — 같은 슬롯 재시도 방지
          await markSlotFired(sessionId, slots, slot.time, ymd);
          continue;
        }

        await postKeywordAlertMessages(sessionId, result.content, result.sources ?? [], result.matchedKeyword, slot.time);
        await markSlotFired(sessionId, slots, slot.time, ymd);
        out.push({ sessionId, slotTime: slot.time, status: "fired" });
      } catch (err) {
        console.error(`[collect-news] 정시 알림 실패 (${sessionId}@${slot.time}):`, err);
        out.push({ sessionId, slotTime: slot.time, status: "error" });
      }
    }
  }

  return out;
}

async function markSlotFired(
  sessionId: string,
  slots: ScheduledNewsSlot[],
  firedTime: string,
  ymd: string
): Promise<void> {
  const updated: ScheduledNewsSlot[] = slots.map((s) =>
    s.time === firedTime ? { ...s, lastFiredYmd: ymd } : s
  );
  const db = getAdminDb();
  await db.collection("keywordAlerts").doc(sessionId).set(
    { scheduledTimes: updated, lastCheckedAt: FieldValue.serverTimestamp() },
    { merge: true }
  );
}

/**
 * 정시 알림 결과를 messages 컬렉션에 페르소나="키워드 알림" assistant 메시지로 작성하고
 * 세션 미리보기를 갱신. 클라이언트 useKeywordAlert.checkNews 와 메시지 형태를 맞춤.
 */
async function postKeywordAlertMessages(
  sessionId: string,
  content: string,
  sources: NewsSource[],
  matchedKeyword: string | undefined,
  slotTime: string
): Promise<void> {
  const db = getAdminDb();
  const headline = matchedKeyword
    ? `🔔 [${matchedKeyword}] ${slotTime} 정시 알림`
    : `🔔 ${slotTime} 정시 알림`;
  const fullContent = `${headline}\n\n${content}`;
  const paragraphs = fullContent
    .split("\n\n")
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  for (let i = 0; i < paragraphs.length; i++) {
    const isLast = i === paragraphs.length - 1;
    await db.collection("messages").add({
      sessionId,
      role: "assistant",
      content: paragraphs[i],
      sources: isLast ? sources : [],
      personaId: "keyword-alert",
      personaName: "키워드 알림",
      personaIcon: "🔔",
      scheduledSlot: slotTime,
      ...(matchedKeyword && { matchedKeyword }),
      createdAt: FieldValue.serverTimestamp(),
    });
  }

  const lastPreview = paragraphs[paragraphs.length - 1] || headline;
  await db.collection("sessions").doc(sessionId).set(
    {
      updatedAt: FieldValue.serverTimestamp(),
      lastMessage: lastPreview.length > 100 ? lastPreview.slice(0, 100) + "..." : lastPreview,
      lastMessageAt: FieldValue.serverTimestamp(),
      lastMessageSenderName: "키워드 알림",
    },
    { merge: true }
  );
}

// ── 페르소나(빌트인/커스텀) 정시 키워드 뉴스 자동 배달 ─────────────
// users/{uid}/personaSchedules/{personaId} 문서를 collectionGroup 으로 스캔.
// 도래한 슬롯이 있으면 runKeywordAlert 로 뉴스를 받아 그 페르소나와 가장 최근 대화한
// 세션에 페르소나 자신의 personaId/이름/아이콘으로 메시지를 게시한다.
interface PersonaScheduleFireResult {
  personaId: string;
  uid: string;
  slotTime: string;
  status: "fired" | "no-news" | "no-session" | "no-persona" | "skipped" | "error";
  sessionId?: string;
}

async function findLatestSessionForPersona(
  uid: string,
  personaId: string
): Promise<string | null> {
  const db = getAdminDb();
  try {
    // 가장 최근 메시지 1건만 가져와서 그 세션을 사용 (사용자가 마지막으로 이 멘토와 대화한 곳)
    const msgSnap = await db
      .collection("messages")
      .where("personaId", "==", personaId)
      .orderBy("createdAt", "desc")
      .limit(1)
      .get();
    if (msgSnap.empty) return null;
    const sessionId = msgSnap.docs[0].get("sessionId") as string | undefined;
    if (!sessionId) return null;

    // 세션 소유권 검증 (혹시 모를 personaId 충돌 방어)
    const sessSnap = await db.collection("sessions").doc(sessionId).get();
    if (!sessSnap.exists) return null;
    const participants = (sessSnap.get("participants") as string[] | undefined) ?? [];
    if (!participants.includes(uid)) return null;
    return sessionId;
  } catch (err) {
    console.error(`[collect-news] findLatestSessionForPersona 실패 (${uid}/${personaId}):`, err);
    return null;
  }
}

async function markPersonaScheduleSlotFired(
  uid: string,
  personaId: string,
  slots: ScheduledNewsSlot[],
  firedTime: string,
  ymd: string
): Promise<void> {
  const updated: ScheduledNewsSlot[] = slots.map((s) =>
    s.time === firedTime ? { ...s, lastFiredYmd: ymd } : s
  );
  const db = getAdminDb();
  await db
    .collection("users")
    .doc(uid)
    .collection("personaSchedules")
    .doc(personaId)
    .set(
      { scheduledTimes: updated, updatedAt: FieldValue.serverTimestamp() },
      { merge: true }
    );
}

async function processPersonaSchedules(): Promise<PersonaScheduleFireResult[]> {
  const db = getAdminDb();
  const { minuteOfDay, ymd } = kstNow();
  const out: PersonaScheduleFireResult[] = [];

  let snap;
  try {
    snap = await db
      .collectionGroup("personaSchedules")
      .where("enabled", "==", true)
      .get();
  } catch (err) {
    console.error("[collect-news] persona schedule 스캔 실패:", err);
    return out;
  }

  for (const docSnap of snap.docs) {
    const data = docSnap.data() as PersonaSchedule;
    const uid = data.uid;
    const personaId = data.personaId || docSnap.id;
    const slots: ScheduledNewsSlot[] = data.scheduledTimes ?? [];
    const keywords = data.keywords ?? [];
    if (!uid || slots.length === 0 || keywords.length === 0) continue;

    for (const slot of slots) {
      const slotMin = parseHhmmToMinute(slot.time);
      if (slotMin === null) continue;
      const diff = Math.abs(slotMin - minuteOfDay);
      if (diff > CRON_TOLERANCE_MINUTES) continue;
      if (slot.lastFiredYmd === ymd) continue;

      try {
        const persona = await resolvePersona(uid, personaId);
        if (!persona) {
          out.push({ personaId, uid, slotTime: slot.time, status: "no-persona" });
          continue;
        }

        const sessionId = await findLatestSessionForPersona(uid, personaId);
        if (!sessionId) {
          // 사용자가 아직 이 페르소나와 대화한 적이 없음 — 슬롯 소비하지 않고 다음 크론에서 재시도
          out.push({ personaId, uid, slotTime: slot.time, status: "no-session" });
          continue;
        }

        const result = await runKeywordAlert(keywords);
        if (!result.hasNews || !result.content) {
          out.push({ personaId, uid, slotTime: slot.time, status: "no-news", sessionId });
          await markPersonaScheduleSlotFired(uid, personaId, slots, slot.time, ymd);
          continue;
        }

        await postBriefMessages({
          sessionId,
          persona,
          content: result.content,
          sources: result.sources ?? [],
          matchedKeyword: result.matchedKeyword,
          kind: "scheduled",
          slotLabel: slot.time,
        });
        await markPersonaScheduleSlotFired(uid, personaId, slots, slot.time, ymd);
        out.push({ personaId, uid, slotTime: slot.time, status: "fired", sessionId });
      } catch (err) {
        console.error(
          `[collect-news] 페르소나 스케줄 알림 실패 (${uid}/${personaId}@${slot.time}):`,
          err
        );
        out.push({ personaId, uid, slotTime: slot.time, status: "error" });
      }
    }
  }

  return out;
}

export async function POST(req: NextRequest) {
  if (!authorize(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const results: Record<string, string> = {};
  await Promise.all(
    TARGET_PERSONAS.map(async (pid) => {
      const status = await collectForPersona(pid);
      results[pid] = status;
    })
  );

  const summary = Object.entries(results).reduce<Record<string, number>>(
    (acc, [, status]) => {
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    },
    {}
  );

  // 정시 키워드 알림도 처리 (실패해도 페르소나 수집 결과는 반환)
  let scheduled: ScheduledFireResult[] = [];
  try {
    scheduled = await processScheduledKeywordAlerts();
  } catch (err) {
    console.error("[collect-news] 정시 알림 처리 전체 실패:", err);
  }

  let personaSchedules: PersonaScheduleFireResult[] = [];
  try {
    personaSchedules = await processPersonaSchedules();
  } catch (err) {
    console.error("[collect-news] 페르소나 스케줄 처리 전체 실패:", err);
  }

  return NextResponse.json({ ok: true, summary, results, scheduled, personaSchedules });
}

// Vercel Cron은 GET 으로도 호출할 수 있게 한다.
export const GET = POST;
