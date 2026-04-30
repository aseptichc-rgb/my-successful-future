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
import { GoogleGenerativeAI } from "@google/generative-ai";
import { collectForPersona } from "@/lib/personaNewsCollector";
import { runKeywordAlert } from "@/lib/keyword-alert-runner";
import { getAdminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import {
  KST_OFFSET_MINUTES,
  CRON_TOLERANCE_MINUTES,
} from "@/lib/constants/keyword-alert";
import {
  resolvePersona,
  postBriefMessages,
  hasRecentUserActivity,
  type ResolvedPersona,
} from "@/lib/persona-brief-poster";
import { withRetry } from "@/lib/gemini";
import { sendChatPush } from "@/lib/serverPush";
import { buildMorningBriefPrompt, buildEveningReflectionPrompt } from "@/lib/prompts";
import type {
  BuiltinPersonaId,
  KeywordAlertConfig,
  ScheduledNewsSlot,
  NewsSource,
  PersonaSchedule,
  DailyRitualConfig,
  User,
} from "@/types";

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

function formatMinuteToHhmm(minute: number): string {
  const h = Math.floor(minute / 60) % 24;
  const m = minute % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * 정시 브리핑이 능동적인 대화에 끼어들지 않도록 하는 유예 시간(분).
 * 사용자가 이 시간 안에 마지막 메시지를 보냈으면 발사를 다음 크론 틱으로 미룬다.
 */
const ACTIVE_USER_GRACE_MINUTES = 5;
/**
 * 슬롯 시각과 실제 발사 시각이 이 시간 이상 벌어지면 라벨에 "(예약 HH:mm)" 부기.
 */
const DELAY_TAG_THRESHOLD_MINUTES = 30;

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
      // 슬롯 시각이 아직 도래하지 않았으면 스킵 (허용 오차 포함)
      if (slotMin > minuteOfDay + CRON_TOLERANCE_MINUTES) continue;
      // 오늘 이미 발사했으면 스킵
      if (slot.lastFiredYmd === ymd) continue;

      try {
        // 사용자가 능동적으로 대화 중이면 끼어들지 않고 다음 크론 틱으로 연기
        if (await hasRecentUserActivity(sessionId, ACTIVE_USER_GRACE_MINUTES)) {
          out.push({ sessionId, slotTime: slot.time, status: "skipped" });
          continue;
        }

        const result = await runKeywordAlert(keywords);
        if (!result.hasNews || !result.content) {
          out.push({ sessionId, slotTime: slot.time, status: "no-news" });
          // 뉴스가 없어도 이번 슬롯은 소비 — 같은 슬롯 재시도 방지
          await markSlotFired(sessionId, slots, slot.time, ymd);
          continue;
        }

        const firedAtLabel = formatMinuteToHhmm(minuteOfDay);
        const delayMin = minuteOfDay - slotMin;
        const delayedFromSlot =
          delayMin >= DELAY_TAG_THRESHOLD_MINUTES ? slot.time : undefined;

        await postKeywordAlertMessages(
          sessionId,
          result.content,
          result.sources ?? [],
          result.matchedKeyword,
          slot.time,
          firedAtLabel,
          delayedFromSlot,
        );
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
  slotTime: string,
  firedAtLabel: string,
  delayedFromSlot: string | undefined,
): Promise<void> {
  const db = getAdminDb();
  const baseLabel = `${firedAtLabel} 정시 알림`;
  const label = delayedFromSlot ? `${baseLabel} (예약 ${delayedFromSlot})` : baseLabel;
  const headline = matchedKeyword
    ? `🔔 [${matchedKeyword}] ${label}`
    : `🔔 ${label}`;
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

/**
 * 기존 세션이 없을 때 페르소나 브리핑 전용 세션을 자동 생성한다.
 * 사용자가 로그인하지 않은 상태에서도 크론이 메시지를 남길 수 있도록 하기 위함.
 */
async function createSessionForPersona(
  uid: string,
  persona: ResolvedPersona
): Promise<string> {
  const db = getAdminDb();
  const ref = await db.collection("sessions").add({
    uid,
    title: `${persona.icon} ${persona.name}`,
    sessionType: "ai",
    participants: [uid],
    participantNames: { [uid]: "나" },
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  return ref.id;
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
      // 슬롯 시각이 아직 도래하지 않았으면 스킵 (허용 오차 포함)
      if (slotMin > minuteOfDay + CRON_TOLERANCE_MINUTES) continue;
      // 오늘 이미 발사했으면 스킵
      if (slot.lastFiredYmd === ymd) continue;

      try {
        const persona = await resolvePersona(uid, personaId);
        if (!persona) {
          out.push({ personaId, uid, slotTime: slot.time, status: "no-persona" });
          continue;
        }

        let sessionId = await findLatestSessionForPersona(uid, personaId);
        if (!sessionId) {
          // 기존 세션이 없으면 자동 생성 — 로그인하지 않아도 브리핑이 쌓이도록
          sessionId = await createSessionForPersona(uid, persona);
        }

        // 사용자가 능동적으로 대화 중이면 끼어들지 않고 다음 크론 틱으로 연기
        if (await hasRecentUserActivity(sessionId, ACTIVE_USER_GRACE_MINUTES)) {
          out.push({ personaId, uid, slotTime: slot.time, status: "skipped", sessionId });
          continue;
        }

        const result = await runKeywordAlert(keywords);
        if (!result.hasNews || !result.content) {
          out.push({ personaId, uid, slotTime: slot.time, status: "no-news", sessionId });
          await markPersonaScheduleSlotFired(uid, personaId, slots, slot.time, ymd);
          continue;
        }

        const firedAtLabel = formatMinuteToHhmm(minuteOfDay);
        const delayMin = minuteOfDay - slotMin;
        const delayedFromSlot =
          delayMin >= DELAY_TAG_THRESHOLD_MINUTES ? slot.time : undefined;

        await postBriefMessages({
          sessionId,
          persona,
          content: result.content,
          sources: result.sources ?? [],
          matchedKeyword: result.matchedKeyword,
          kind: "scheduled",
          firedAtLabel,
          delayedFromSlot,
          scheduledSlot: slot.time,
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

// ── 데일리 리추얼 (아침 브리프 / 저녁 회고) ───────────────────
// 클라이언트 폴링(useDailyRitual)과 병행. 사용자가 화면을 켜놓지 않아도
// 정해진 시각이 도래하면 서버 cron이 발사한다. lastMorningDate/lastEveningDate
// 로 일일 1회 보장 → 클라이언트와의 더블 발사도 방지된다.
interface DailyRitualFireResult {
  uid: string;
  kind: "morning" | "evening";
  status: "fired" | "no-future-persona" | "no-session" | "skipped" | "error";
  sessionId?: string;
}

const RITUAL_GEMINI_MODEL = "gemini-2.5-flash-lite";

async function findOrCreateFutureSelfSession(uid: string, displayName: string): Promise<string | null> {
  const db = getAdminDb();
  try {
    const existing = await db
      .collection("sessions")
      .where("uid", "==", uid)
      .where("sessionType", "==", "future-self")
      .limit(1)
      .get();
    if (!existing.empty) return existing.docs[0].id;

    const ref = await db.collection("sessions").add({
      uid,
      title: "🌟 미래의 나와의 대화",
      sessionType: "future-self",
      participants: [uid],
      participantNames: { [uid]: displayName || "나" },
      pinnedBy: [uid],
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return ref.id;
  } catch (err) {
    console.error(`[collect-news] future-self 세션 확보 실패 (${uid}):`, err);
    return null;
  }
}

async function postDailyRitualMessages(
  uid: string,
  sessionId: string,
  kind: "morning" | "evening",
  content: string,
): Promise<void> {
  const db = getAdminDb();
  const kindLabel = kind === "morning" ? "☀️ 아침 브리프" : "🌙 저녁 회고";
  const paragraphs = content
    .split("\n\n")
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  if (paragraphs.length === 0) return;

  for (let i = 0; i < paragraphs.length; i++) {
    const text = i === 0 ? `${kindLabel}\n\n${paragraphs[i]}` : paragraphs[i];
    await db.collection("messages").add({
      sessionId,
      role: "assistant",
      content: text,
      sources: [],
      personaId: "future-self",
      personaName: "미래의 나",
      personaIcon: "🌟",
      createdAt: FieldValue.serverTimestamp(),
    });
  }

  const lastPreview = paragraphs[paragraphs.length - 1];
  const previewTrimmed =
    lastPreview.length > 100 ? lastPreview.slice(0, 100) + "..." : lastPreview;
  await db.collection("sessions").doc(sessionId).set(
    {
      updatedAt: FieldValue.serverTimestamp(),
      lastMessage: previewTrimmed,
      lastMessageAt: FieldValue.serverTimestamp(),
      lastMessageSenderName: "미래의 나",
    },
    { merge: true }
  );

  // 스마트폰 푸시 — 토큰 없으면 sendChatPush 가 조용히 skip.
  try {
    await sendChatPush({
      uid,
      sessionId,
      title: `🌟 미래의 나 — ${kindLabel}`,
      body: previewTrimmed,
    });
  } catch (err) {
    console.warn(`[collect-news] daily ritual 푸시 실패 (${uid}/${kind}):`, err);
  }
}

async function fireDailyRitual(
  uid: string,
  kind: "morning" | "evening",
  config: DailyRitualConfig,
  ymd: string,
): Promise<DailyRitualFireResult> {
  const db = getAdminDb();

  // 사용자 정보 로드 (futurePersona 필수)
  const userSnap = await db.collection("users").doc(uid).get();
  if (!userSnap.exists) return { uid, kind, status: "no-future-persona" };
  const userData = userSnap.data() as User;
  const futurePersona = (userData.futurePersona || "").trim();
  if (!futurePersona) return { uid, kind, status: "no-future-persona" };

  // 세션 확보
  let sessionId = config.sessionId;
  if (!sessionId) {
    const newId = await findOrCreateFutureSelfSession(uid, userData.displayName || "나");
    if (!newId) return { uid, kind, status: "no-session" };
    sessionId = newId;
  } else {
    // 저장된 sessionId가 여전히 유효한지 확인
    const sessSnap = await db.collection("sessions").doc(sessionId).get();
    if (!sessSnap.exists) {
      const newId = await findOrCreateFutureSelfSession(uid, userData.displayName || "나");
      if (!newId) return { uid, kind, status: "no-session" };
      sessionId = newId;
    }
  }

  // Gemini 호출 (mood 는 서버에서는 unknown — 클라이언트 폴링 기반이라 여기선 생략)
  const apiKey = process.env.GEMINI_API_KEY || "";
  if (!apiKey) return { uid, kind, status: "error", sessionId };
  const genAI = new GoogleGenerativeAI(apiKey);
  const systemPrompt =
    kind === "morning"
      ? buildMorningBriefPrompt(userData.userPersona, futurePersona, userData.userMemory, undefined)
      : buildEveningReflectionPrompt(userData.userPersona, futurePersona, userData.userMemory, undefined);
  const model = genAI.getGenerativeModel({ model: RITUAL_GEMINI_MODEL, systemInstruction: systemPrompt });
  const trigger =
    kind === "morning"
      ? "지금 아침이야. 오늘 하루를 시작하는 메시지를 보내줘."
      : "지금 저녁이야. 오늘 하루를 마무리하는 메시지를 보내줘.";

  const result = await withRetry(() => model.generateContent(trigger));
  const text = result.response.text();
  if (!text || !text.trim()) return { uid, kind, status: "error", sessionId };

  await postDailyRitualMessages(uid, sessionId, kind, text);

  // lastMorningDate/lastEveningDate 업데이트 → 일일 1회 보장
  const update: Partial<DailyRitualConfig> =
    kind === "morning"
      ? { lastMorningDate: ymd, sessionId }
      : { lastEveningDate: ymd, sessionId };
  await db.collection("dailyRitualConfigs").doc(uid).set(update, { merge: true });

  return { uid, kind, status: "fired", sessionId };
}

async function processDailyRituals(): Promise<DailyRitualFireResult[]> {
  const db = getAdminDb();
  const { minuteOfDay, ymd } = kstNow();
  const out: DailyRitualFireResult[] = [];

  let snap;
  try {
    snap = await db.collection("dailyRitualConfigs").where("enabled", "==", true).get();
  } catch (err) {
    console.error("[collect-news] daily ritual 스캔 실패:", err);
    return out;
  }

  for (const docSnap of snap.docs) {
    const uid = docSnap.id;
    const config = docSnap.data() as DailyRitualConfig;

    // 아침 브리프
    if (config.morningEnabled && config.lastMorningDate !== ymd) {
      const targetMin = parseHhmmToMinute(config.morningTime || "07:00");
      if (targetMin !== null && targetMin <= minuteOfDay + CRON_TOLERANCE_MINUTES && targetMin >= minuteOfDay - 60) {
        try {
          out.push(await fireDailyRitual(uid, "morning", config, ymd));
        } catch (err) {
          console.error(`[collect-news] 아침 브리프 실패 (${uid}):`, err);
          out.push({ uid, kind: "morning", status: "error" });
        }
      }
    }

    // 저녁 회고
    if (config.eveningEnabled && config.lastEveningDate !== ymd) {
      const targetMin = parseHhmmToMinute(config.eveningTime || "22:00");
      if (targetMin !== null && targetMin <= minuteOfDay + CRON_TOLERANCE_MINUTES && targetMin >= minuteOfDay - 60) {
        try {
          out.push(await fireDailyRitual(uid, "evening", config, ymd));
        } catch (err) {
          console.error(`[collect-news] 저녁 회고 실패 (${uid}):`, err);
          out.push({ uid, kind: "evening", status: "error" });
        }
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

  let dailyRituals: DailyRitualFireResult[] = [];
  try {
    dailyRituals = await processDailyRituals();
  } catch (err) {
    console.error("[collect-news] 데일리 리추얼 처리 전체 실패:", err);
  }

  return NextResponse.json({ ok: true, summary, results, scheduled, personaSchedules, dailyRituals });
}

// Vercel Cron은 GET 으로도 호출할 수 있게 한다.
export const GET = POST;
