/**
 * 페르소나 정시/실시간 브리프 공용 포스터.
 * collect-news 크론 (정시 슬롯 기반) 과 persona-brief API (채팅방 첫 진입 기반) 이
 * 같은 메시지 포맷과 persona 해석 로직을 공유하도록 추출했다.
 */

import { getAdminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { PERSONAS, isBuiltinPersona, isCustomPersonaId } from "@/lib/personas";
import { KST_OFFSET_MINUTES } from "@/lib/constants/keyword-alert";
import type { BuiltinPersonaId, CustomPersona, NewsSource } from "@/types";

const MS_PER_MINUTE = 60_000;

export interface ResolvedPersona {
  id: string;
  name: string;
  icon: string;
}

/** KST 기준 오늘 날짜 "YYYY-MM-DD". */
export function kstYmd(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + KST_OFFSET_MINUTES * MS_PER_MINUTE);
  return `${kst.getUTCFullYear()}-${String(kst.getUTCMonth() + 1).padStart(2, "0")}-${String(kst.getUTCDate()).padStart(2, "0")}`;
}

/**
 * 빌트인이면 PERSONAS + personaOverrides, 커스텀이면 customPersonas 에서 이름/아이콘 해석.
 */
export async function resolvePersona(
  uid: string,
  personaId: string
): Promise<ResolvedPersona | null> {
  if (isBuiltinPersona(personaId)) {
    const base = PERSONAS[personaId as BuiltinPersonaId];
    if (!base) return null;
    try {
      const db = getAdminDb();
      const overrideSnap = await db
        .collection("users")
        .doc(uid)
        .collection("personaOverrides")
        .doc(personaId)
        .get();
      if (overrideSnap.exists) {
        const data = overrideSnap.data() || {};
        return {
          id: personaId,
          name: (data.name as string) || base.name,
          icon: (data.icon as string) || base.icon,
        };
      }
    } catch (err) {
      console.warn(`[persona-brief] personaOverride 읽기 실패 (${uid}/${personaId}):`, err);
    }
    return { id: personaId, name: base.name, icon: base.icon };
  }

  if (isCustomPersonaId(personaId)) {
    try {
      const db = getAdminDb();
      const snap = await db
        .collection("users")
        .doc(uid)
        .collection("customPersonas")
        .doc(personaId)
        .get();
      if (!snap.exists) return null;
      const data = snap.data() as CustomPersona;
      return { id: personaId, name: data.name, icon: data.icon };
    } catch (err) {
      console.error(`[persona-brief] customPersona 읽기 실패 (${uid}/${personaId}):`, err);
      return null;
    }
  }

  return null;
}

/**
 * 사용자가 해당 세션에서 최근 N분 이내에 메시지를 보냈는지 확인한다.
 * 능동적으로 대화 중인 세션에 정시 브리핑이 끼어들지 않도록 발사 직전 호출.
 */
export async function hasRecentUserActivity(
  sessionId: string,
  withinMinutes: number
): Promise<boolean> {
  try {
    const db = getAdminDb();
    // 기존 (sessionId, createdAt) 단일 복합 인덱스만 사용하기 위해
    // role 필터는 클라이언트에서 적용. 최근 N건 안에 user 메시지가 없으면 비활성 간주.
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
    console.warn(`[persona-brief] 최근 사용자 활동 조회 실패 (${sessionId}):`, err);
    return false;
  }
}

export type BriefLabelKind = "scheduled" | "lazy";

/**
 * 브리프 결과를 messages 컬렉션에 페르소나 assistant 메시지로 다중 paragraph 로 작성하고
 * sessions 문서의 미리보기를 갱신한다.
 */
export async function postBriefMessages(params: {
  sessionId: string;
  persona: ResolvedPersona;
  content: string;
  sources: NewsSource[];
  matchedKeyword?: string;
  kind: BriefLabelKind;
  /**
   * scheduled 인 경우 "HH:mm" 발사 시각. (예약 시각이 아니라 실제 게시되는 시각)
   * lazy 인 경우 생략.
   */
  firedAtLabel?: string;
  /**
   * 예약 슬롯 시각과 실제 발사 시각이 크게 어긋난 경우의 원래 슬롯 "HH:mm".
   * 지정되면 라벨에 "(예약 09:00)" 형태로 부기된다.
   */
  delayedFromSlot?: string;
  /** firestore 에 저장할 슬롯 시각(원본). 검색/디버그용. */
  scheduledSlot?: string;
}): Promise<void> {
  const {
    sessionId, persona, content, sources, matchedKeyword, kind,
    firedAtLabel, delayedFromSlot, scheduledSlot,
  } = params;
  const db = getAdminDb();

  let label: string;
  if (kind === "scheduled") {
    const base = `${firedAtLabel ?? ""} 정시 뉴스 브리핑`.trim();
    label = delayedFromSlot ? `${base} (예약 ${delayedFromSlot})` : base;
  } else {
    label = "오늘의 키워드 뉴스 브리핑";
  }
  const headline = matchedKeyword
    ? `${persona.icon} [${matchedKeyword}] ${label}`
    : `${persona.icon} ${label}`;

  const paragraphs = `${headline}\n\n${content}`
    .split("\n\n")
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  for (let i = 0; i < paragraphs.length; i++) {
    const isLast = i === paragraphs.length - 1;
    const messageDoc: Record<string, unknown> = {
      sessionId,
      role: "assistant",
      content: paragraphs[i],
      sources: isLast ? sources : [],
      personaId: persona.id,
      personaName: persona.name,
      personaIcon: persona.icon,
      createdAt: FieldValue.serverTimestamp(),
    };
    if (matchedKeyword) messageDoc.matchedKeyword = matchedKeyword;
    if (kind === "scheduled" && scheduledSlot) messageDoc.scheduledSlot = scheduledSlot;
    await db.collection("messages").add(messageDoc);
  }

  const lastPreview = paragraphs[paragraphs.length - 1] || headline;
  await db.collection("sessions").doc(sessionId).set(
    {
      updatedAt: FieldValue.serverTimestamp(),
      lastMessage: lastPreview.length > 100 ? lastPreview.slice(0, 100) + "..." : lastPreview,
      lastMessageAt: FieldValue.serverTimestamp(),
      lastMessageSenderName: persona.name,
    },
    { merge: true }
  );
}
