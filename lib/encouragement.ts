/**
 * 페르소나 일일 격려 메시지 러너.
 *
 * 흐름:
 *   1) plan: 매일 아침 (~07:30 KST) 사용자별로 격려 대상 페르소나를 모으고
 *      각 페르소나가 발사할 시각(분)을 [08:00, 18:00) 사이에서 랜덤하게 결정해
 *      users/{uid}/dailyEncouragements/{ymd} 문서에 저장한다.
 *   2) fire: 매시 정각 (08-18 KST) 도래한 항목을 찾아 페르소나의 시스템 프롬프트
 *      그대로 활용한 짧은 격려 문구(1~2문장)를 생성하고 1:1 세션에 게시한다.
 *
 * 안전 장치:
 *   - 항목별 fired 플래그로 일일 1회 보장 (크론 재시도 안전).
 *   - 사용자가 능동적으로 대화 중이면 끼어들지 않고 다음 틱으로 연기.
 *   - 모든 비동기 호출은 try-catch + 사용자별/페르소나별 격리해서 한 명의 실패가
 *     전체 처리를 막지 못하게 한다.
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAdminDb, getAdminMessaging } from "@/lib/firebase-admin";
import { withRetry } from "@/lib/gemini";
import { PERSONAS, BUILTIN_PERSONA_IDS } from "@/lib/personas";
import { KST_OFFSET_MINUTES, CRON_TOLERANCE_MINUTES } from "@/lib/constants/keyword-alert";
import type {
  BuiltinPersonaId,
  CustomPersona,
  DailyEncouragementItem,
  DailyEncouragementPlan,
  PersonaOverride,
} from "@/types";

// ── 상수 ─────────────────────────────────────────────
const MS_PER_MINUTE = 60_000;
const ENCOURAGEMENT_MODEL = "gemini-2.5-flash-lite";
/** 격려 발사 가능 분 범위 [start, end). 08:00 ~ 18:00 KST. */
const FIRE_WINDOW_START_MIN = 8 * 60;
const FIRE_WINDOW_END_MIN = 18 * 60;
/** 사용자가 최근 N분 내에 메시지를 보냈으면 끼어들지 않고 연기한다. */
const ACTIVE_USER_GRACE_MINUTES = 5;
/** 격려 응답 최대 토큰 — 1~2문장이면 충분. */
const ENCOURAGEMENT_MAX_TOKENS = 200;
/** 발사 라벨 prefix (메시지 본문 헤드라인용) */
const ENCOURAGEMENT_LABEL = "💌 오늘의 격려";
/** 빌트인 중 격려 대상에서 제외 (뉴스봇은 personality 없음, future-self는 별도 데일리 리추얼 보유) */
const EXCLUDED_BUILTIN_IDS: ReadonlySet<BuiltinPersonaId> = new Set([
  "default",
  "future-self",
]);

// ── 타입 ────────────────────────────────────────────
export interface PlanResult {
  uid: string;
  ymd: string;
  status: "planned" | "already-planned" | "no-personas" | "error";
  personaCount?: number;
}

export interface FireResult {
  uid: string;
  personaId: string;
  status: "fired" | "no-session" | "no-persona" | "skipped" | "error" | "empty";
  sessionId?: string;
}

interface ResolvedPersonaInfo {
  id: string;
  name: string;
  icon: string;
  systemPromptAddition: string;
}

// ── 시간 헬퍼 ────────────────────────────────────────
export function kstNow(): { minuteOfDay: number; ymd: string } {
  const now = new Date();
  const kst = new Date(now.getTime() + KST_OFFSET_MINUTES * MS_PER_MINUTE);
  const minuteOfDay = kst.getUTCHours() * 60 + kst.getUTCMinutes();
  const ymd = `${kst.getUTCFullYear()}-${String(kst.getUTCMonth() + 1).padStart(2, "0")}-${String(kst.getUTCDate()).padStart(2, "0")}`;
  return { minuteOfDay, ymd };
}

/** [start, end) 범위에서 균일 랜덤 정수 분을 뽑는다. */
function randomMinuteInWindow(): number {
  const span = FIRE_WINDOW_END_MIN - FIRE_WINDOW_START_MIN;
  return FIRE_WINDOW_START_MIN + Math.floor(Math.random() * span);
}

// ── 페르소나 enumeration ─────────────────────────────

/**
 * 사용자가 격려를 받을 페르소나 목록을 결정한다.
 *   - 빌트인: BUILTIN_PERSONA_IDS - EXCLUDED_BUILTIN_IDS
 *   - 커스텀: users/{uid}/customPersonas 전부
 * 발사 시점에 1:1 세션 존재 여부를 다시 검증하므로 여기서는 후보만 모은다.
 */
async function listEncouragementPersonas(uid: string): Promise<string[]> {
  const ids: string[] = [];
  for (const id of BUILTIN_PERSONA_IDS) {
    if (EXCLUDED_BUILTIN_IDS.has(id)) continue;
    ids.push(id);
  }
  try {
    const db = getAdminDb();
    const snap = await db
      .collection("users")
      .doc(uid)
      .collection("customPersonas")
      .get();
    snap.forEach((doc) => {
      const data = doc.data() as CustomPersona | undefined;
      if (data?.id) ids.push(data.id);
    });
  } catch (err) {
    console.warn(`[encouragement] customPersonas 조회 실패 (${uid}):`, err);
  }
  return ids;
}

// ── plan ────────────────────────────────────────────
/**
 * 한 사용자의 오늘자 격려 계획을 생성한다. 이미 존재하면 no-op.
 */
export async function planUserEncouragements(uid: string): Promise<PlanResult> {
  const db = getAdminDb();
  const { ymd } = kstNow();
  const planRef = db
    .collection("users")
    .doc(uid)
    .collection("dailyEncouragements")
    .doc(ymd);

  try {
    const existing = await planRef.get();
    if (existing.exists) {
      return { uid, ymd, status: "already-planned" };
    }

    const personaIds = await listEncouragementPersonas(uid);
    if (personaIds.length === 0) {
      return { uid, ymd, status: "no-personas" };
    }

    const items: DailyEncouragementItem[] = personaIds.map((personaId) => ({
      personaId,
      dueMinute: randomMinuteInWindow(),
      fired: false,
    }));

    await planRef.set({
      uid,
      ymd,
      items,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return { uid, ymd, status: "planned", personaCount: items.length };
  } catch (err) {
    console.error(`[encouragement] plan 실패 (${uid}):`, err);
    return { uid, ymd, status: "error" };
  }
}

/**
 * 모든 사용자에 대해 오늘자 계획을 만든다.
 * 사용자별 실패가 전체를 막지 않도록 격리.
 */
export async function planAllUsers(): Promise<PlanResult[]> {
  const db = getAdminDb();
  const out: PlanResult[] = [];
  let snap;
  try {
    snap = await db.collection("users").get();
  } catch (err) {
    console.error("[encouragement] users 스캔 실패:", err);
    return out;
  }
  for (const userDoc of snap.docs) {
    try {
      out.push(await planUserEncouragements(userDoc.id));
    } catch (err) {
      console.error(`[encouragement] planUserEncouragements 실패 (${userDoc.id}):`, err);
      out.push({ uid: userDoc.id, ymd: kstNow().ymd, status: "error" });
    }
  }
  return out;
}

// ── 페르소나 해석 (시스템 프롬프트 포함) ──────────────
async function resolvePersonaWithPrompt(
  uid: string,
  personaId: string
): Promise<ResolvedPersonaInfo | null> {
  const db = getAdminDb();
  // 빌트인
  if ((BUILTIN_PERSONA_IDS as string[]).includes(personaId)) {
    const base = PERSONAS[personaId as BuiltinPersonaId];
    if (!base) return null;
    let name = base.name;
    let icon = base.icon;
    let systemPromptAddition = base.systemPromptAddition;
    try {
      const ovSnap = await db
        .collection("users")
        .doc(uid)
        .collection("personaOverrides")
        .doc(personaId)
        .get();
      if (ovSnap.exists) {
        const ov = ovSnap.data() as PersonaOverride | undefined;
        if (ov?.name?.trim()) name = ov.name.trim();
        if (ov?.icon?.trim()) icon = ov.icon.trim();
        if (ov?.systemPromptAddition?.trim()) {
          systemPromptAddition = ov.systemPromptAddition.trim();
        }
      }
    } catch (err) {
      console.warn(
        `[encouragement] personaOverride 읽기 실패 (${uid}/${personaId}):`,
        err
      );
    }
    return { id: personaId, name, icon, systemPromptAddition };
  }
  // 커스텀
  if (personaId.startsWith("custom:")) {
    try {
      const snap = await db
        .collection("users")
        .doc(uid)
        .collection("customPersonas")
        .doc(personaId)
        .get();
      if (!snap.exists) return null;
      const data = snap.data() as CustomPersona;
      return {
        id: personaId,
        name: data.name,
        icon: data.icon,
        systemPromptAddition: data.systemPromptAddition,
      };
    } catch (err) {
      console.error(
        `[encouragement] customPersona 읽기 실패 (${uid}/${personaId}):`,
        err
      );
      return null;
    }
  }
  return null;
}

// ── 1:1 세션 확보 ─────────────────────────────────────

/**
 * 페르소나의 가장 최근 1:1 AI 세션을 찾는다. 없으면 새로 만든다.
 * 1:1 판정: sessionType === "ai" 이고 advisorIds 미지정 또는 [personaId] 단일.
 */
async function findOrCreateOneOnOneSession(
  uid: string,
  persona: ResolvedPersonaInfo
): Promise<string | null> {
  const db = getAdminDb();
  try {
    // 페르소나가 발화한 가장 최근 메시지 → 그 세션을 1:1 후보로
    const msgSnap = await db
      .collection("messages")
      .where("personaId", "==", persona.id)
      .orderBy("createdAt", "desc")
      .limit(10)
      .get();

    for (const doc of msgSnap.docs) {
      const sessionId = doc.get("sessionId") as string | undefined;
      if (!sessionId) continue;
      const sessSnap = await db.collection("sessions").doc(sessionId).get();
      if (!sessSnap.exists) continue;
      const sessionType = sessSnap.get("sessionType") as string | undefined;
      const participants = (sessSnap.get("participants") as string[] | undefined) ?? [];
      const advisorIds = sessSnap.get("advisorIds") as string[] | undefined;
      if (sessionType !== "ai") continue;
      if (!participants.includes(uid)) continue;
      // 1:1 조건: advisorIds 없거나 (이 페르소나 단일)
      const isOneOnOne =
        !advisorIds ||
        advisorIds.length === 0 ||
        (advisorIds.length === 1 && advisorIds[0] === persona.id);
      if (!isOneOnOne) continue;
      return sessionId;
    }
  } catch (err) {
    console.error(
      `[encouragement] 1:1 세션 탐색 실패 (${uid}/${persona.id}):`,
      err
    );
  }

  // 없으면 새로 생성
  try {
    const ref = await db.collection("sessions").add({
      uid,
      title: `${persona.icon} ${persona.name}`,
      sessionType: "ai",
      participants: [uid],
      participantNames: { [uid]: "나" },
      advisorIds: [persona.id],
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return ref.id;
  } catch (err) {
    console.error(
      `[encouragement] 1:1 세션 생성 실패 (${uid}/${persona.id}):`,
      err
    );
    return null;
  }
}

// ── 능동 대화 감지 (collect-news 와 동일 정책) ────────
async function hasRecentUserActivity(
  sessionId: string,
  withinMinutes: number
): Promise<boolean> {
  try {
    const db = getAdminDb();
    const snap = await db
      .collection("messages")
      .where("sessionId", "==", sessionId)
      .orderBy("createdAt", "desc")
      .limit(20)
      .get();
    if (snap.empty) return false;
    const cutoffMs = Date.now() - withinMinutes * MS_PER_MINUTE;
    for (const doc of snap.docs) {
      if (doc.get("role") !== "user") continue;
      const ts = doc.get("createdAt") as { toMillis?: () => number } | undefined;
      if (!ts || typeof ts.toMillis !== "function") continue;
      return ts.toMillis() >= cutoffMs;
    }
    return false;
  } catch (err) {
    console.warn(
      `[encouragement] 최근 사용자 활동 조회 실패 (${sessionId}):`,
      err
    );
    return false;
  }
}

// ── Gemini 호출 ─────────────────────────────────────
async function generateEncouragement(
  persona: ResolvedPersonaInfo
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY || "";
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY 미설정");
  }
  const genAI = new GoogleGenerativeAI(apiKey);
  const systemInstruction = `${persona.systemPromptAddition}

## 지금 상황
당신은 사용자에게 짧은 격려/응원 메시지를 보냅니다. 사용자는 답장을 요청하지 않았습니다.
당신의 페르소나 톤과 어휘를 그대로 살려 자연스럽게 한마디 건네주세요.

규칙:
- 1~2 문장으로 짧게 (60자~120자 사이)
- 인사말("안녕하세요" 등) 없이 본론으로 바로 들어갈 것
- 문단 구분 없이 한 단락으로
- 사용자가 오늘 하루를 헤쳐나가는 데 도움이 되는 격려·용기·관점 제시
- 마크다운 서식, 이모지 남발 금지 (이모지 0~1개 허용)
- 같은 표현 반복 금지 — 이번 한마디만의 메시지가 되어야 함`;

  const model = genAI.getGenerativeModel({
    model: ENCOURAGEMENT_MODEL,
    systemInstruction,
    generationConfig: {
      maxOutputTokens: ENCOURAGEMENT_MAX_TOKENS,
      temperature: 0.95,
    },
  });

  const trigger = "지금 사용자에게 보낼 격려 한마디를 그대로 출력해줘.";
  const result = await withRetry(() => model.generateContent(trigger));
  const text = result.response.text().trim();
  if (!text) {
    throw new Error("빈 응답");
  }
  return text;
}

// ── 메시지 게시 + (선택) 푸시 ────────────────────────
async function postEncouragementMessage(params: {
  uid: string;
  sessionId: string;
  persona: ResolvedPersonaInfo;
  content: string;
}): Promise<void> {
  const { uid, sessionId, persona, content } = params;
  const db = getAdminDb();

  const headline = `${persona.icon} ${ENCOURAGEMENT_LABEL}`;
  const fullText = `${headline}\n\n${content}`;

  await db.collection("messages").add({
    sessionId,
    role: "assistant",
    content: fullText,
    sources: [],
    personaId: persona.id,
    personaName: persona.name,
    personaIcon: persona.icon,
    createdAt: FieldValue.serverTimestamp(),
  });

  const preview = content.length > 100 ? content.slice(0, 100) + "..." : content;
  await db.collection("sessions").doc(sessionId).set(
    {
      updatedAt: FieldValue.serverTimestamp(),
      lastMessage: preview,
      lastMessageAt: FieldValue.serverTimestamp(),
      lastMessageSenderName: persona.name,
    },
    { merge: true }
  );

  // FCM 푸시 — 토큰 없으면 조용히 skip. 실패해도 메시지 자체는 이미 저장됨.
  try {
    await sendEncouragementPush({
      uid,
      sessionId,
      personaName: persona.name,
      preview,
    });
  } catch (err) {
    console.warn(
      `[encouragement] 푸시 전송 실패 (${uid}/${persona.id}):`,
      err
    );
  }
}

async function sendEncouragementPush(params: {
  uid: string;
  sessionId: string;
  personaName: string;
  preview: string;
}): Promise<void> {
  const { uid, sessionId, personaName, preview } = params;
  const db = getAdminDb();
  const tokenSnap = await db
    .collection("fcmTokens")
    .where("uid", "==", uid)
    .get();
  const tokens = tokenSnap.docs
    .map((d) => d.get("token") as string | undefined)
    .filter((t): t is string => typeof t === "string" && t.length > 0);
  if (tokens.length === 0) return;

  const messaging = getAdminMessaging();
  const result = await messaging.sendEachForMulticast({
    tokens,
    data: {
      title: personaName,
      body: preview,
      sessionId,
    },
  });

  // 만료 토큰 정리
  const expired: string[] = [];
  result.responses.forEach((resp, idx) => {
    if (
      !resp.success &&
      resp.error?.code === "messaging/registration-token-not-registered"
    ) {
      expired.push(tokens[idx]);
    }
  });
  if (expired.length > 0) {
    for (const token of expired) {
      const dead = await db.collection("fcmTokens").where("token", "==", token).get();
      dead.docs.forEach((d) => d.ref.delete());
    }
  }
}

// ── fire ────────────────────────────────────────────

/** plan 문서의 items 배열에서 특정 personaId 항목을 fired 로 마킹한다. */
async function markItemFired(
  uid: string,
  ymd: string,
  personaId: string,
  sessionId: string
): Promise<void> {
  const db = getAdminDb();
  const ref = db
    .collection("users")
    .doc(uid)
    .collection("dailyEncouragements")
    .doc(ymd);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return;
    const data = snap.data() as DailyEncouragementPlan | undefined;
    const items = data?.items ?? [];
    // serverTimestamp 는 배열 항목 안에서 사용할 수 없으므로 클라이언트 시각으로 기록.
    const firedAt = Timestamp.now();
    const updated: DailyEncouragementItem[] = items.map((it) =>
      it.personaId === personaId
        ? { ...it, fired: true, sessionId, firedAt: firedAt as never }
        : it
    );
    tx.set(
      ref,
      { items: updated, updatedAt: FieldValue.serverTimestamp() },
      { merge: true }
    );
  });
}

/**
 * 한 사용자 한 페르소나 항목을 발사한다.
 */
async function fireOne(
  uid: string,
  ymd: string,
  item: DailyEncouragementItem
): Promise<FireResult> {
  try {
    const persona = await resolvePersonaWithPrompt(uid, item.personaId);
    if (!persona) {
      return { uid, personaId: item.personaId, status: "no-persona" };
    }
    const sessionId = await findOrCreateOneOnOneSession(uid, persona);
    if (!sessionId) {
      return { uid, personaId: item.personaId, status: "no-session" };
    }
    if (await hasRecentUserActivity(sessionId, ACTIVE_USER_GRACE_MINUTES)) {
      return { uid, personaId: item.personaId, status: "skipped", sessionId };
    }
    let content: string;
    try {
      content = await generateEncouragement(persona);
    } catch (err) {
      console.error(
        `[encouragement] 생성 실패 (${uid}/${item.personaId}):`,
        err
      );
      return { uid, personaId: item.personaId, status: "empty", sessionId };
    }
    await postEncouragementMessage({ uid, sessionId, persona, content });
    await markItemFired(uid, ymd, item.personaId, sessionId);
    return { uid, personaId: item.personaId, status: "fired", sessionId };
  } catch (err) {
    console.error(
      `[encouragement] fireOne 실패 (${uid}/${item.personaId}):`,
      err
    );
    return { uid, personaId: item.personaId, status: "error" };
  }
}

/**
 * 모든 사용자×페르소나에 대해 도래한 격려 항목을 발사한다.
 */
export async function fireDueEncouragements(): Promise<FireResult[]> {
  const db = getAdminDb();
  const { minuteOfDay, ymd } = kstNow();
  const out: FireResult[] = [];

  let snap;
  try {
    snap = await db
      .collectionGroup("dailyEncouragements")
      .where("ymd", "==", ymd)
      .get();
  } catch (err) {
    console.error("[encouragement] dailyEncouragements 스캔 실패:", err);
    return out;
  }

  for (const planDoc of snap.docs) {
    const plan = planDoc.data() as DailyEncouragementPlan;
    const uid = plan.uid;
    if (!uid) continue;
    const items: DailyEncouragementItem[] = plan.items ?? [];
    for (const item of items) {
      if (item.fired) continue;
      if (item.dueMinute > minuteOfDay + CRON_TOLERANCE_MINUTES) continue;
      out.push(await fireOne(uid, ymd, item));
    }
  }

  return out;
}
