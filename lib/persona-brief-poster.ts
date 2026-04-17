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
  /** scheduled 인 경우 "HH:mm" 슬롯 시간. lazy 인 경우 생략하거나 현재 시각 라벨. */
  slotLabel?: string;
}): Promise<void> {
  const { sessionId, persona, content, sources, matchedKeyword, kind, slotLabel } = params;
  const db = getAdminDb();

  const label = kind === "scheduled"
    ? `${slotLabel ?? ""} 정시 뉴스 브리핑`.trim()
    : "오늘의 키워드 뉴스 브리핑";
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
    if (kind === "scheduled" && slotLabel) messageDoc.scheduledSlot = slotLabel;
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
