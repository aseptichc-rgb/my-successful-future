"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createSession, onSessionsSnapshot } from "@/lib/firebase";
import { formatRelativeDate } from "@/lib/locale";
import { PERSONAS, getPersona } from "@/lib/personas";
import { useCustomPersonas } from "@/hooks/useCustomPersonas";
import NewChatModal from "@/components/chat/NewChatModal";
import type { ChatSession, PersonaId } from "@/types";

// 홈에서 먼저 노출할 빌트인 자문단 (default·future-self 제외)
const ADVISOR_PREVIEW_IDS: PersonaId[] = [
  "entrepreneur",
  "fund-trader",
  "tech-cto",
  "policy-analyst",
  "healthcare-expert",
];

interface Props {
  uid: string;
  displayName: string;
  futureSelfId: string | null;
}

function todayKoreanLabel(): string {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });
  return fmt.format(now);
}

export default function HomeDashboard({ uid, displayName, futureSelfId }: Props) {
  const router = useRouter();
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [showNewChat, setShowNewChat] = useState(false);
  const [advisorLaunching, setAdvisorLaunching] = useState<PersonaId | null>(null);

  const { map: customPersonaMap, list: customPersonaList } = useCustomPersonas(uid);

  useEffect(() => {
    if (!uid) return;
    let active = true;
    const unsub = onSessionsSnapshot(uid, (list) => {
      if (!active) return;
      setSessions(list);
      setSessionsLoading(false);
    });
    return () => {
      active = false;
      unsub();
    };
  }, [uid]);

  const recentChats = useMemo(() => {
    const list = sessions.filter((s) => s.sessionType !== "future-self");
    const sorted = [...list].sort((a, b) => {
      const aPinned = a.pinnedBy?.includes(uid) ? 1 : 0;
      const bPinned = b.pinnedBy?.includes(uid) ? 1 : 0;
      if (aPinned !== bPinned) return bPinned - aPinned;
      const aTime = a.lastMessageAt?.toMillis?.() ?? a.updatedAt?.toMillis?.() ?? 0;
      const bTime = b.lastMessageAt?.toMillis?.() ?? b.updatedAt?.toMillis?.() ?? 0;
      return bTime - aTime;
    });
    return sorted.slice(0, 5);
  }, [sessions, uid]);

  const goFutureSelf = () => {
    if (futureSelfId) router.push(`/chat/${futureSelfId}`);
  };
  const goAdvisors = () => router.push("/chat/advisors");
  const goInbox = () => router.push("/chat/inbox");
  const goSession = (id: string) => router.push(`/chat/${id}`);

  // 홈의 자문단 미니 카드 클릭: 해당 페르소나와의 최근 AI 세션이 있으면 거기로,
  // 없으면 새로 만들고 이동. 자문단 페이지의 handleCardClick 과 동일한 규칙.
  const handleAdvisorMiniClick = useCallback(
    async (personaId: PersonaId) => {
      if (!uid || advisorLaunching) return;
      const persona = getPersona(personaId, customPersonaMap);
      const existing = sessions.find(
        (s) => s.sessionType === "ai" && s.title?.includes(persona.name),
      );
      if (existing) {
        router.push(`/chat/${existing.id}?persona=${personaId}`);
        return;
      }
      setAdvisorLaunching(personaId);
      try {
        const sessionId = await createSession(
          uid,
          `${persona.name}님과의 대화`,
          displayName,
          "ai",
        );
        router.push(`/chat/${sessionId}?persona=${personaId}`);
      } catch (err) {
        console.error("자문단 세션 생성 실패:", err);
        setAdvisorLaunching(null);
      }
    },
    [uid, displayName, sessions, customPersonaMap, router, advisorLaunching],
  );

  return (
    <div className="flex-1 overflow-y-auto bg-[#f5f5f7]">
      {/* Hero — Apple-style immersive black section */}
      <section className="bg-black text-white">
        <div className="mx-auto max-w-3xl px-5 pt-12 pb-10 sm:px-6 sm:pt-16 sm:pb-12">
          <p className="text-[13px] font-medium uppercase tracking-wide text-white/60">
            {todayKoreanLabel()}
          </p>
          <h1 className="mt-3 text-[40px] font-semibold leading-[1.07] tracking-[-0.015em] sm:text-[56px]">
            안녕하세요,<br />
            <span className="text-white/70">{displayName}</span>님.
          </h1>
          <p className="mt-4 text-[17px] leading-[1.47] tracking-[-0.022em] text-white/80">
            오늘도 미래의 당신과 함께, 한 걸음 더.
          </p>

          <div className="mt-7 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={goFutureSelf}
              disabled={!futureSelfId}
              className="inline-flex items-center gap-1.5 rounded-pill bg-[#0071e3] px-[22px] py-[11px] text-[14px] font-medium text-white transition-colors hover:bg-[#0077ed] disabled:opacity-50"
            >
              미래의 나와 대화하기
            </button>
            <button
              type="button"
              onClick={goAdvisors}
              className="inline-flex items-center gap-1.5 rounded-pill border border-white/30 px-[22px] py-[11px] text-[14px] font-medium text-white transition-colors hover:bg-white/10"
            >
              자문단 만나보기<span aria-hidden>›</span>
            </button>
          </div>
        </div>
      </section>

      {/* Advisors mini strip — 홈에서 바로 자문단 진입 */}
      <section className="bg-white">
        <div className="mx-auto max-w-3xl px-5 py-10 sm:px-6 sm:py-12">
          <div className="mb-5 flex items-end justify-between gap-3">
            <div>
              <h2 className="text-[28px] font-semibold leading-[1.14] tracking-[-0.003em] text-[#1d1d1f] sm:text-[32px]">
                내 자문단
              </h2>
              <p className="mt-2 text-[15px] leading-[1.47] tracking-[-0.022em] text-black/60">
                오늘의 고민, 들어줄 전문가를 골라보세요.
              </p>
            </div>
            <button
              type="button"
              onClick={goAdvisors}
              className="shrink-0 text-[14px] font-medium text-[#0066cc] hover:underline"
            >
              전체 보기 ›
            </button>
          </div>
          <div className="-mx-5 flex gap-3 overflow-x-auto px-5 pb-2 hide-scrollbar sm:mx-0 sm:px-0">
            {ADVISOR_PREVIEW_IDS.map((personaId) => {
              const persona = PERSONAS[personaId as keyof typeof PERSONAS];
              const launching = advisorLaunching === personaId;
              return (
                <button
                  key={personaId}
                  type="button"
                  onClick={() => handleAdvisorMiniClick(personaId)}
                  disabled={launching || !!advisorLaunching}
                  className="flex w-[168px] shrink-0 flex-col items-start gap-2 rounded-[18px] bg-[#f5f5f7] p-4 text-left transition-all hover:shadow-apple disabled:opacity-60"
                >
                  <div className="text-[30px] leading-none">{persona.icon}</div>
                  <p className="w-full truncate text-[15px] font-semibold tracking-[-0.022em] text-[#1d1d1f]">
                    {persona.name}
                  </p>
                  <p className="line-clamp-2 w-full text-[12px] leading-[1.35] tracking-[-0.01em] text-black/56">
                    {persona.description}
                  </p>
                  {launching && (
                    <span className="mt-1 h-3 w-3 animate-spin rounded-full border border-black/10 border-t-[#0071e3]" />
                  )}
                </button>
              );
            })}
            {customPersonaList.slice(0, 4).map((cp) => {
              const launching = advisorLaunching === cp.id;
              return (
                <button
                  key={cp.id}
                  type="button"
                  onClick={() => handleAdvisorMiniClick(cp.id as PersonaId)}
                  disabled={launching || !!advisorLaunching}
                  className="flex w-[168px] shrink-0 flex-col items-start gap-2 rounded-[18px] bg-[#f5f5f7] p-4 text-left transition-all hover:shadow-apple disabled:opacity-60"
                >
                  <div className="text-[30px] leading-none">{cp.icon}</div>
                  <p className="w-full truncate text-[15px] font-semibold tracking-[-0.022em] text-[#1d1d1f]">
                    {cp.name}
                  </p>
                  <p className="line-clamp-2 w-full text-[12px] leading-[1.35] tracking-[-0.01em] text-black/56">
                    {cp.description || "내가 만든 멘토"}
                  </p>
                  {launching && (
                    <span className="mt-1 h-3 w-3 animate-spin rounded-full border border-black/10 border-t-[#0071e3]" />
                  )}
                </button>
              );
            })}
            <button
              type="button"
              onClick={goAdvisors}
              className="flex w-[168px] shrink-0 flex-col items-start justify-center gap-1 rounded-[18px] border border-dashed border-black/15 p-4 text-left text-black/60 transition-colors hover:border-[#0071e3] hover:text-[#0071e3]"
            >
              <div className="text-[30px] leading-none">＋</div>
              <p className="text-[14px] font-medium tracking-[-0.01em]">새 멘토 만들기</p>
              <p className="text-[11px] tracking-[-0.01em] text-black/48">나만의 AI를 설계해요.</p>
            </button>
          </div>
        </div>
      </section>

      {/* Quick entry tiles — alternating white section */}
      <section className="bg-[#f5f5f7]">
        <div className="mx-auto max-w-3xl px-5 py-10 sm:px-6 sm:py-12">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <button
              type="button"
              onClick={goFutureSelf}
              disabled={!futureSelfId}
              className="group relative overflow-hidden rounded-[18px] bg-black p-6 text-left text-white transition-all hover:shadow-apple-lg disabled:opacity-60"
            >
              <p className="text-[13px] font-medium uppercase tracking-wide text-white/60">
                Future Self
              </p>
              <p className="mt-3 text-[24px] font-semibold leading-[1.14] tracking-[-0.005em]">
                미래의 나와 대화
              </p>
              <p className="mt-1 text-[14px] leading-[1.29] tracking-[-0.016em] text-white/70">
                오늘 하루를 함께 정리해요.
              </p>
              <p className="mt-5 inline-flex items-center gap-0.5 text-[14px] font-medium text-[#2997ff]">
                시작하기<span aria-hidden>›</span>
              </p>
            </button>
            <button
              type="button"
              onClick={goAdvisors}
              className="group relative overflow-hidden rounded-[18px] bg-white p-6 text-left text-[#1d1d1f] transition-all hover:shadow-apple"
            >
              <p className="text-[13px] font-medium uppercase tracking-wide text-black/56">
                Advisors
              </p>
              <p className="mt-3 text-[24px] font-semibold leading-[1.14] tracking-[-0.005em]">
                여러 전문가에게 한 번에
              </p>
              <p className="mt-1 text-[14px] leading-[1.29] tracking-[-0.016em] text-black/60">
                고민 하나에 여러 관점을 모아 듣기.
              </p>
              <p className="mt-5 inline-flex items-center gap-0.5 text-[14px] font-medium text-[#0066cc]">
                자문단 열기<span aria-hidden>›</span>
              </p>
            </button>
          </div>
        </div>
      </section>

      {/* Recent chats — return to light gray */}
      <section className="bg-[#f5f5f7]">
        <div className="mx-auto max-w-3xl px-5 py-10 sm:px-6 sm:py-12">
          <div className="mb-5 flex items-end justify-between gap-3">
            <div>
              <h2 className="text-[28px] font-semibold leading-[1.14] tracking-[-0.003em] text-[#1d1d1f] sm:text-[32px]">
                최근 대화
              </h2>
              <p className="mt-2 text-[15px] leading-[1.47] tracking-[-0.022em] text-black/60">
                이어서 나누던 이야기를 다시 열어보세요.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={goInbox}
                className="text-[14px] font-medium text-[#0066cc] hover:underline"
              >
                전체 보기 ›
              </button>
              <button
                type="button"
                onClick={() => setShowNewChat(true)}
                className="rounded-pill bg-[#0071e3] px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-[#0077ed]"
              >
                + 새 대화
              </button>
            </div>
          </div>

          <div className="overflow-hidden rounded-[18px] bg-white shadow-apple">
            {sessionsLoading ? (
              <div className="py-10 text-center text-[14px] text-black/48">
                불러오는 중…
              </div>
            ) : recentChats.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-[15px] tracking-[-0.022em] text-black/60">
                  아직 대화가 없어요.
                </p>
                <button
                  type="button"
                  onClick={() => setShowNewChat(true)}
                  className="mt-3 inline-flex items-center gap-1 text-[14px] font-medium text-[#0066cc] hover:underline"
                >
                  새 대화 시작하기<span aria-hidden>›</span>
                </button>
              </div>
            ) : (
              <ul>
                {recentChats.map((s, idx) => {
                  const unread = s.unreadCounts?.[uid] || 0;
                  const ts = s.lastMessageAt || s.updatedAt;
                  const when = ts?.toDate ? formatRelativeDate(ts.toDate()) : "";
                  const icon =
                    s.sessionType === "ai"
                      ? "🤖"
                      : s.sessionType === "dm"
                        ? "💬"
                        : "👥";
                  return (
                    <li
                      key={s.id}
                      className={idx !== 0 ? "border-t border-black/5" : ""}
                    >
                      <button
                        type="button"
                        onClick={() => goSession(s.id)}
                        className="flex w-full items-start gap-3 px-5 py-4 text-left transition-colors hover:bg-black/[0.02]"
                      >
                        <span
                          aria-hidden
                          className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#f5f5f7] text-[16px]"
                        >
                          {icon}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[15px] font-medium tracking-[-0.022em] text-[#1d1d1f]">
                            {s.title || "새 대화"}
                          </p>
                          {s.lastMessage && (
                            <p className="mt-0.5 truncate text-[13px] tracking-[-0.01em] text-black/56">
                              {s.lastMessageSenderName && (
                                <span className="font-medium text-black/70">
                                  {s.lastMessageSenderName}:{" "}
                                </span>
                              )}
                              {s.lastMessage}
                            </p>
                          )}
                          <p className="mt-1 text-[11px] tracking-[-0.01em] text-black/48">
                            {when}
                          </p>
                        </div>
                        {unread > 0 && (
                          <span className="mt-1 flex h-[20px] min-w-[20px] shrink-0 items-center justify-center rounded-full bg-[#0071e3] px-1.5 text-[11px] font-semibold text-white">
                            {unread > 99 ? "99+" : unread}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </section>

      {showNewChat && (
        <NewChatModal
          uid={uid}
          displayName={displayName}
          onClose={() => setShowNewChat(false)}
        />
      )}
    </div>
  );
}
