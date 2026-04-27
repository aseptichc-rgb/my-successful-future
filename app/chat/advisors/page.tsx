"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { onSessionsSnapshot, createSession } from "@/lib/firebase";
import { PERSONAS, getPersona } from "@/lib/personas";
import { formatRelativeDate } from "@/lib/locale";
import { useCustomPersonas } from "@/hooks/useCustomPersonas";
import { usePersonaOverrides } from "@/hooks/usePersonaOverrides";
import CustomPersonaBuilder from "@/components/chat/CustomPersonaBuilder";
import PersonaEditorModal from "@/components/chat/PersonaEditorModal";
import { mergePersona } from "@/lib/persona-resolver";
import PersonaRefDocsModal from "@/components/chat/PersonaRefDocsModal";
import PersonaScheduleModal from "@/components/chat/PersonaScheduleModal";
import PersonaIcon from "@/components/ui/PersonaIcon";
import type { BuiltinPersonaId, ChatSession, CustomPersona, PersonaId } from "@/types";

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
  const { map: overrideMap, upsert: upsertOverride, reset: resetOverride } = usePersonaOverrides(firebaseUser?.uid);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [editingCustom, setEditingCustom] = useState<CustomPersona | null>(null);
  const [editingBuiltin, setEditingBuiltin] = useState<BuiltinPersonaId | null>(null);
  const [refDocsTarget, setRefDocsTarget] = useState<{ id: PersonaId; name: string; icon: string } | null>(null);
  const [scheduleTarget, setScheduleTarget] = useState<{ id: PersonaId; name: string; icon: string } | null>(null);
  // 복수 자문단 방 만들기 모달
  const [multiSelectOpen, setMultiSelectOpen] = useState(false);
  const [selectedAdvisorIds, setSelectedAdvisorIds] = useState<PersonaId[]>([]);
  const [multiCreating, setMultiCreating] = useState(false);

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
    const persona = getPersona(personaId, customMap, overrideMap);
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
      const persona = getPersona(personaId, customMap, overrideMap);
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

  // 복수 자문단 방 만들기
  const toggleAdvisorSelection = (personaId: PersonaId) => {
    setSelectedAdvisorIds((prev) =>
      prev.includes(personaId)
        ? prev.filter((id) => id !== personaId)
        : [...prev, personaId],
    );
  };

  const handleCreateMultiAdvisor = async () => {
    if (!firebaseUser || multiCreating) return;
    if (selectedAdvisorIds.length < 2) return;
    const displayName = user?.displayName || firebaseUser.displayName || "사용자";

    setMultiCreating(true);
    try {
      // 방 제목은 선택한 자문단 이름들로 자동 생성
      const names = selectedAdvisorIds
        .map((id) => getPersona(id, customMap, overrideMap).name)
        .slice(0, 3);
      const titleBase = names.join(", ");
      const suffix = selectedAdvisorIds.length > 3
        ? ` 외 ${selectedAdvisorIds.length - 3}명`
        : "";
      const title = `${titleBase}${suffix} 자문단`;

      const sessionId = await createSession(
        firebaseUser.uid,
        title,
        displayName,
        "ai",
        undefined,
        undefined,
        selectedAdvisorIds,
      );
      router.push(`/chat/${sessionId}`);
    } catch (err) {
      console.error("복수 자문단 세션 생성 실패:", err);
      setMultiCreating(false);
    }
  };

  const openMultiSelect = () => {
    setSelectedAdvisorIds([]);
    setMultiSelectOpen(true);
  };

  if (loading || !firebaseUser) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-black/10 border-t-[#1E1B4B]" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-[#F0EDE6]">
      <header className="border-b border-black/[0.06] bg-white px-5 py-5 sm:px-6 sm:py-7">
        <div className="mx-auto max-w-3xl">
          <h1 className="text-[28px] font-semibold leading-[1.14] tracking-[-0.005em] text-[#1E1B4B] sm:text-[32px]">
            자문단
          </h1>
          <p className="mt-2 text-[15px] leading-[1.47] tracking-[-0.022em] text-black/60">
            분야별 AI 전문가에게 조언을 구해보세요. 한 명, 혹은 여러 명을 한 방에.
          </p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-5 py-8 pb-24 sm:px-6 lg:pb-8">
        <div className="mx-auto max-w-3xl">
          {/* 카운슬 CTA — 여러 자문단을 한 방에 소집 */}
          <button
            type="button"
            onClick={openMultiSelect}
            className="mb-8 flex w-full items-center justify-between gap-4 rounded-[18px] bg-gradient-to-r from-[#1E1B4B] to-[#4F4BA8] px-5 py-4 text-left text-white shadow-apple transition-transform hover:scale-[1.01]"
          >
            <div className="min-w-0 flex-1">
              <p className="text-[16px] font-semibold leading-[1.2] tracking-[-0.022em]">
                🪑 여러 전문가에게 한 번에 물어보기
              </p>
              <p className="mt-1 text-[13px] leading-[1.4] tracking-[-0.01em] text-white/85">
                오늘 고민, 2명 이상 자문단에게 동시에 의견을 받아보세요.
              </p>
            </div>
            <span className="shrink-0 text-[14px] font-medium" aria-hidden>
              시작하기 ›
            </span>
          </button>

          {/* 빌트인 자문단 */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            {ADVISOR_IDS.map((personaId) => {
              const base = PERSONAS[personaId as keyof typeof PERSONAS];
              const persona = mergePersona(base, overrideMap[personaId as string]);
              const latest = findLatestSessionFor(personaId);
              const isCreating = creating === personaId;
              const isOverridden = !!overrideMap[personaId as string];

              return (
                <div
                  key={personaId}
                  className="group relative flex flex-col items-start gap-2 rounded-[18px] bg-white p-5 text-left transition-all hover:shadow-apple"
                >
                  <button
                    onClick={() => handleCardClick(personaId)}
                    disabled={isCreating}
                    className="flex w-full flex-col items-start gap-3 text-left disabled:opacity-50"
                  >
                    <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-full bg-[#F0EDE6] text-[#1E1B4B]">
                      <PersonaIcon
                        personaId={personaId}
                        fallbackEmoji={persona.icon}
                        photoUrl={persona.photoUrl}
                        className={persona.photoUrl ? "h-12 w-12" : "h-7 w-7"}
                      />
                    </div>
                    <div className="w-full">
                      <p className="truncate text-[17px] font-semibold tracking-[-0.022em] text-[#1E1B4B]">
                        {persona.name}
                        {isOverridden && (
                          <span className="ml-1.5 text-[10px] font-normal tracking-[-0.01em] text-[#1E1B4B]">·수정됨</span>
                        )}
                      </p>
                      <p className="mt-1 line-clamp-2 text-[13px] leading-[1.4] tracking-[-0.01em] text-black/56">
                        {persona.description}
                      </p>
                    </div>
                    <div className="flex w-full items-center justify-between">
                      {latest?.lastMessageAt?.toDate ? (
                        <span className="text-[11px] tracking-[-0.01em] text-black/48">
                          {formatRelativeDate(latest.lastMessageAt.toDate())}
                        </span>
                      ) : (
                        <span className="text-[11px] tracking-[-0.01em] text-black/30">대화 시작 전</span>
                      )}
                      {isCreating && (
                        <span className="h-3 w-3 animate-spin rounded-full border border-black/10 border-t-[#1E1B4B]" />
                      )}
                    </div>
                    {latest?.lastMessage && (
                      <p className="line-clamp-1 w-full text-[11px] tracking-[-0.01em] text-black/40">
                        {latest.lastMessage}
                      </p>
                    )}
                  </button>
                  <div className="absolute right-3 top-3 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setScheduleTarget({ id: personaId, name: persona.name, icon: persona.icon });
                      }}
                      className="rounded-pill bg-[#F0EDE6] px-2 py-1 text-[10px] font-medium tracking-[-0.01em] text-black/60 transition-colors hover:text-[#1E1B4B]"
                      aria-label="뉴스 키워드 설정"
                    >
                      뉴스
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setRefDocsTarget({ id: personaId, name: persona.name, icon: persona.icon });
                      }}
                      className="rounded-pill bg-[#F0EDE6] px-2 py-1 text-[10px] font-medium tracking-[-0.01em] text-black/60 transition-colors hover:text-[#1E1B4B]"
                      aria-label="참조 문서"
                    >
                      문서
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingBuiltin(personaId as BuiltinPersonaId);
                      }}
                      className="rounded-pill bg-[#F0EDE6] px-2 py-1 text-[10px] font-medium tracking-[-0.01em] text-black/60 transition-colors hover:text-[#1E1B4B]"
                      aria-label="역할 편집"
                    >
                      편집
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* 내 멘토 섹션 */}
          <div className="mt-12">
            <div className="mb-4 flex items-end justify-between">
              <div>
                <h2 className="text-[22px] font-semibold leading-[1.18] tracking-[-0.005em] text-[#1E1B4B]">
                  내 멘토
                </h2>
                <p className="mt-1 text-[13px] tracking-[-0.01em] text-black/56">
                  본인 전용. 말투와 관점을 직접 설계할 수 있어요.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditingCustom(null);
                  setBuilderOpen(true);
                }}
                className="rounded-pill border border-[#1E1B4B] px-4 py-2 text-[13px] font-medium text-[#1E1B4B] transition-colors hover:bg-[#1E1B4B]/5"
              >
                + 멘토 만들기
              </button>
            </div>

            {customList.length === 0 ? (
              <div className="rounded-[18px] bg-white p-10 text-center text-[14px] tracking-[-0.022em] text-black/48">
                아직 만든 멘토가 없어요.<br />
                회계사 아버지, 창업 선배, 나만의 코치 — 직접 설계해보세요.
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
                {customList.map((cp) => {
                  const latest = findLatestSessionFor(cp.id);
                  const isCreating = creating === cp.id;
                  return (
                    <div
                      key={cp.id}
                      className="group relative flex flex-col items-start gap-2 rounded-[18px] bg-white p-5 text-left transition-all hover:shadow-apple"
                    >
                      <button
                        onClick={() => handleCardClick(cp.id)}
                        disabled={isCreating}
                        className="flex w-full flex-col items-start gap-3 text-left disabled:opacity-50"
                      >
                        <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-full bg-[#F0EDE6] text-[#1E1B4B] text-[28px]">
                          <PersonaIcon
                            personaId={cp.id}
                            fallbackEmoji={cp.icon}
                            photoUrl={cp.photoUrl}
                            className={cp.photoUrl ? "h-12 w-12" : "h-7 w-7"}
                          />
                        </div>
                        <div className="w-full">
                          <p className="truncate text-[17px] font-semibold tracking-[-0.022em] text-[#1E1B4B]">
                            {cp.name}
                          </p>
                          <p className="mt-1 line-clamp-2 text-[13px] leading-[1.4] tracking-[-0.01em] text-black/56">
                            {cp.description || "내가 만든 멘토"}
                          </p>
                        </div>
                        <div className="flex w-full items-center justify-between">
                          {latest?.lastMessageAt?.toDate ? (
                            <span className="text-[11px] tracking-[-0.01em] text-black/48">
                              {formatRelativeDate(latest.lastMessageAt.toDate())}
                            </span>
                          ) : (
                            <span className="text-[11px] tracking-[-0.01em] text-black/30">대화 시작 전</span>
                          )}
                          {isCreating && (
                            <span className="h-3 w-3 animate-spin rounded-full border border-black/10 border-t-[#1E1B4B]" />
                          )}
                        </div>
                      </button>
                      <div className="absolute right-3 top-3 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setScheduleTarget({ id: cp.id, name: cp.name, icon: cp.icon });
                          }}
                          className="rounded-pill bg-[#F0EDE6] px-2 py-1 text-[10px] font-medium tracking-[-0.01em] text-black/60 transition-colors hover:text-[#1E1B4B]"
                          aria-label="뉴스 키워드 설정"
                        >
                          뉴스
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setRefDocsTarget({ id: cp.id, name: cp.name, icon: cp.icon });
                          }}
                          className="rounded-pill bg-[#F0EDE6] px-2 py-1 text-[10px] font-medium tracking-[-0.01em] text-black/60 transition-colors hover:text-[#1E1B4B]"
                          aria-label="참조 문서"
                        >
                          문서
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingCustom(cp);
                            setBuilderOpen(true);
                          }}
                          className="rounded-pill bg-[#F0EDE6] px-2 py-1 text-[10px] font-medium tracking-[-0.01em] text-black/60 transition-colors hover:text-[#1E1B4B]"
                        >
                          편집
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {refDocsTarget && (
        <PersonaRefDocsModal
          personaId={refDocsTarget.id}
          personaName={refDocsTarget.name}
          personaIcon={refDocsTarget.icon}
          onClose={() => setRefDocsTarget(null)}
        />
      )}

      {scheduleTarget && (
        <PersonaScheduleModal
          personaId={scheduleTarget.id}
          personaName={scheduleTarget.name}
          personaIcon={scheduleTarget.icon}
          onClose={() => setScheduleTarget(null)}
        />
      )}

      {editingBuiltin && (
        <PersonaEditorModal
          personaId={editingBuiltin}
          override={overrideMap[editingBuiltin]}
          onSave={(data) => upsertOverride(editingBuiltin, data)}
          onReset={() => resetOverride(editingBuiltin)}
          onClose={() => setEditingBuiltin(null)}
        />
      )}

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

      {multiSelectOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
          onClick={() => !multiCreating && setMultiSelectOpen(false)}
        >
          <div
            className="flex max-h-[85vh] w-full max-w-md flex-col rounded-t-[18px] bg-white shadow-apple-lg sm:rounded-[18px]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between border-b border-black/[0.06] px-6 py-5">
              <div className="min-w-0 flex-1">
                <h2 className="text-[20px] font-semibold leading-[1.2] tracking-[-0.005em] text-[#1E1B4B]">
                  여러 자문단과 대화
                </h2>
                <p className="mt-1.5 text-[13px] leading-[1.4] tracking-[-0.01em] text-black/60">
                  한 방에 모을 자문단을 2명 이상 선택하세요.
                </p>
              </div>
              <button
                onClick={() => !multiCreating && setMultiSelectOpen(false)}
                disabled={multiCreating}
                className="shrink-0 rounded-full p-1.5 text-black/40 transition-colors hover:bg-black/[0.04] hover:text-black/70 disabled:opacity-50"
                aria-label="닫기"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-3 py-3">
              <p className="px-2 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-black/40">
                전문 자문단
              </p>
              {ADVISOR_IDS.map((personaId) => {
                const base = PERSONAS[personaId as keyof typeof PERSONAS];
                const persona = mergePersona(base, overrideMap[personaId as string]);
                const checked = selectedAdvisorIds.includes(personaId);
                return (
                  <button
                    key={personaId}
                    type="button"
                    onClick={() => toggleAdvisorSelection(personaId)}
                    className={`flex w-full items-center gap-3 rounded-[12px] px-3 py-2.5 text-left transition-colors ${
                      checked ? "bg-[#1E1B4B]/8" : "hover:bg-black/[0.03]"
                    }`}
                  >
                    <div
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-[5px] border transition-colors ${
                        checked ? "border-[#1E1B4B] bg-[#1E1B4B]" : "border-black/15"
                      }`}
                    >
                      {checked && (
                        <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                    <span className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-full bg-[#F0EDE6] text-[#1E1B4B]">
                      <PersonaIcon
                        personaId={personaId}
                        fallbackEmoji={persona.icon}
                        photoUrl={persona.photoUrl}
                        className={persona.photoUrl ? "h-7 w-7" : "h-4 w-4"}
                      />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-medium tracking-[-0.01em] text-[#1E1B4B]">{persona.name}</p>
                      <p className="truncate text-[12px] tracking-[-0.01em] text-black/56">{persona.description}</p>
                    </div>
                  </button>
                );
              })}

              {customList.length > 0 && (
                <>
                  <p className="px-2 pb-2 pt-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-black/40">
                    내 멘토
                  </p>
                  {customList.map((cp) => {
                    const checked = selectedAdvisorIds.includes(cp.id);
                    return (
                      <button
                        key={cp.id}
                        type="button"
                        onClick={() => toggleAdvisorSelection(cp.id)}
                        className={`flex w-full items-center gap-3 rounded-[12px] px-3 py-2.5 text-left transition-colors ${
                          checked ? "bg-[#1E1B4B]/8" : "hover:bg-black/[0.03]"
                        }`}
                      >
                        <div
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-[5px] border transition-colors ${
                            checked ? "border-[#1E1B4B] bg-[#1E1B4B]" : "border-black/15"
                          }`}
                        >
                          {checked && (
                            <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>
                        <span className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-full bg-[#F0EDE6] text-[#1E1B4B] text-[16px]">
                          <PersonaIcon
                            personaId={cp.id}
                            fallbackEmoji={cp.icon}
                            photoUrl={cp.photoUrl}
                            className={cp.photoUrl ? "h-7 w-7" : "h-4 w-4"}
                          />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[14px] font-medium tracking-[-0.01em] text-[#1E1B4B]">{cp.name}</p>
                          <p className="truncate text-[12px] tracking-[-0.01em] text-black/56">{cp.description || "내가 만든 멘토"}</p>
                        </div>
                      </button>
                    );
                  })}
                </>
              )}
            </div>

            <div className="border-t border-black/[0.06] px-6 py-4">
              <button
                type="button"
                onClick={handleCreateMultiAdvisor}
                disabled={selectedAdvisorIds.length < 2 || multiCreating}
                className="w-full rounded-pill bg-[#1E1B4B] py-3 text-[14px] font-medium text-white transition-colors hover:bg-[#2A2766] disabled:bg-black/10 disabled:text-black/40"
              >
                {multiCreating
                  ? "만드는 중…"
                  : selectedAdvisorIds.length < 2
                    ? "2명 이상 선택해주세요"
                    : `${selectedAdvisorIds.length}명과 대화 시작`}
              </button>
              <p className="mt-2.5 text-center text-[11px] tracking-[-0.01em] text-black/48">
                대화방 안에서 @이름 으로 특정 자문단을 지목할 수도 있습니다.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
