"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { onSessionsSnapshot, createSession } from "@/lib/firebase";
import { PERSONAS } from "@/lib/personas";
import { formatRelativeDate } from "@/lib/locale";
import type { ChatSession, PersonaId } from "@/types";

// 자문단으로 노출할 페르소나 (future-self는 별도 홈, default 뉴스봇은 일반 뉴스용이라 포함)
const ADVISOR_IDS: PersonaId[] = [
  "entrepreneur",
  "fund-trader",
  "tech-cto",
  "policy-analyst",
  "healthcare-expert",
  "default",
];

export default function AdvisorsPage() {
  const router = useRouter();
  const { user, firebaseUser, loading } = useAuth();
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [creating, setCreating] = useState<PersonaId | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!firebaseUser) {
      router.push("/login");
      return;
    }
    const unsub = onSessionsSnapshot(firebaseUser.uid, setSessions);
    return unsub;
  }, [firebaseUser, loading, router]);

  // 페르소나별 가장 최근 AI 세션 찾기 (제목에 페르소나 이름이 포함된 ai 세션 중 최신)
  const findLatestSessionFor = (personaId: PersonaId): ChatSession | null => {
    const persona = PERSONAS[personaId];
    const matches = sessions.filter(
      (s) => s.sessionType === "ai" && s.title?.includes(persona.name),
    );
    if (matches.length === 0) return null;
    // updatedAt 내림차순 정렬은 onSessionsSnapshot에서 이미 처리됨
    return matches[0];
  };

  const handleCardClick = async (personaId: PersonaId) => {
    if (!firebaseUser || creating) return;
    const displayName = user?.displayName || firebaseUser.displayName || "사용자";

    // 기존 세션이 있으면 그곳으로
    const existing = findLatestSessionFor(personaId);
    if (existing) {
      router.push(`/chat/${existing.id}?persona=${personaId}`);
      return;
    }

    // 없으면 새로 생성
    setCreating(personaId);
    try {
      const persona = PERSONAS[personaId];
      const sessionId = await createSession(
        firebaseUser.uid,
        `${persona.name}님과의 대화`,
        displayName,
        "ai",
      );
      router.push(`/chat/${sessionId}?persona=${personaId}`);
    } catch (err) {
      console.error("자문단 세션 생성 실패:", err);
      setCreating(null);
    }
  };

  if (loading || !firebaseUser) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-gray-50">
      <header className="border-b border-gray-200 bg-white px-4 py-4">
        <h1 className="text-lg font-bold text-gray-900">🧭 자문단</h1>
        <p className="mt-1 text-xs text-gray-500">
          분야별 AI 전문가에게 조언을 구해보세요. 한 명을 골라 대화를 시작합니다.
        </p>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4 pb-24 lg:pb-4">
        <div className="mx-auto grid max-w-3xl grid-cols-2 gap-3 lg:grid-cols-3">
          {ADVISOR_IDS.map((personaId) => {
            const persona = PERSONAS[personaId];
            const latest = findLatestSessionFor(personaId);
            const isCreating = creating === personaId;

            return (
              <button
                key={personaId}
                onClick={() => handleCardClick(personaId)}
                disabled={isCreating}
                className="flex flex-col items-start gap-2 rounded-2xl border border-gray-200 bg-white p-4 text-left shadow-sm transition-all hover:border-blue-300 hover:shadow-md disabled:opacity-50"
              >
                <div className="text-3xl">{persona.icon}</div>
                <div className="w-full">
                  <p className="truncate text-sm font-semibold text-gray-900">
                    {persona.name}
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-xs text-gray-500">
                    {persona.description}
                  </p>
                </div>
                <div className="mt-1 flex w-full items-center justify-between">
                  {latest?.lastMessageAt?.toDate ? (
                    <span className="text-[10px] text-gray-400">
                      {formatRelativeDate(latest.lastMessageAt.toDate())}
                    </span>
                  ) : (
                    <span className="text-[10px] text-gray-300">대화 시작 전</span>
                  )}
                  {isCreating && (
                    <span className="h-3 w-3 animate-spin rounded-full border border-gray-300 border-t-blue-600" />
                  )}
                </div>
                {latest?.lastMessage && (
                  <p className="line-clamp-1 w-full text-[11px] text-gray-400">
                    {latest.lastMessage}
                  </p>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
