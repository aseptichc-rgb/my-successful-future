"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { onSessionsSnapshot, createSession } from "@/lib/firebase";
import { PERSONAS, getPersona } from "@/lib/personas";
import { formatRelativeDate } from "@/lib/locale";
import { useCustomPersonas } from "@/hooks/useCustomPersonas";
import CustomPersonaBuilder from "@/components/chat/CustomPersonaBuilder";
import type { ChatSession, CustomPersona, PersonaId } from "@/types";

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
  const { map: customMap, list: customList, create: createCustom, edit: editCustom, remove: removeCustom } = useCustomPersonas(firebaseUser?.uid);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [editingCustom, setEditingCustom] = useState<CustomPersona | null>(null);

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
    const persona = getPersona(personaId, customMap);
    const matches = sessions.filter(
      (s) => s.sessionType === "ai" && s.title?.includes(persona.name),
    );
    if (matches.length === 0) return null;
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
      const persona = getPersona(personaId, customMap);
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
        <div className="mx-auto max-w-3xl">
          {/* 빌트인 자문단 */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            {ADVISOR_IDS.map((personaId) => {
              const persona = PERSONAS[personaId as keyof typeof PERSONAS];
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

          {/* 내 멘토 섹션 */}
          <div className="mt-8">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-gray-900">✨ 내 멘토</h2>
                <p className="mt-0.5 text-[11px] text-gray-500">
                  본인 전용. 말투와 관점을 직접 설계할 수 있어요.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditingCustom(null);
                  setBuilderOpen(true);
                }}
                className="rounded-lg border border-violet-300 bg-violet-50 px-3 py-1.5 text-xs font-medium text-violet-700 hover:bg-violet-100"
              >
                + 멘토 만들기
              </button>
            </div>

            {customList.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-6 text-center text-xs text-gray-400">
                아직 만든 멘토가 없어요. 회계사 아버지, 창업 선배, 나만의 코치 등을 직접 설계해보세요.
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
                {customList.map((cp) => {
                  const latest = findLatestSessionFor(cp.id);
                  const isCreating = creating === cp.id;
                  return (
                    <div
                      key={cp.id}
                      className="group relative flex flex-col items-start gap-2 rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 to-white p-4 text-left shadow-sm transition-all hover:border-violet-400 hover:shadow-md"
                    >
                      <button
                        onClick={() => handleCardClick(cp.id)}
                        disabled={isCreating}
                        className="flex w-full flex-col items-start gap-2 text-left disabled:opacity-50"
                      >
                        <div className="text-3xl">{cp.icon}</div>
                        <div className="w-full">
                          <p className="truncate text-sm font-semibold text-gray-900">
                            {cp.name}
                          </p>
                          <p className="mt-0.5 line-clamp-2 text-xs text-gray-500">
                            {cp.description || "내가 만든 멘토"}
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
                            <span className="h-3 w-3 animate-spin rounded-full border border-gray-300 border-t-violet-600" />
                          )}
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingCustom(cp);
                          setBuilderOpen(true);
                        }}
                        className="absolute right-2 top-2 rounded-md border border-gray-200 bg-white px-1.5 py-0.5 text-[10px] text-gray-500 opacity-0 transition-opacity hover:text-violet-700 group-hover:opacity-100"
                      >
                        편집
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {builderOpen && (
        <CustomPersonaBuilder
          initial={editingCustom || undefined}
          onSave={async (data) => {
            if (editingCustom) {
              await editCustom(editingCustom.id, data);
            } else {
              await createCustom(data);
            }
          }}
          onDelete={editingCustom ? async () => {
            await removeCustom(editingCustom.id);
          } : undefined}
          onClose={() => {
            setBuilderOpen(false);
            setEditingCustom(null);
          }}
        />
      )}
    </div>
  );
}
