"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createSession, onSessionsSnapshot } from "@/lib/firebase";
import { PERSONAS, getPersona } from "@/lib/personas";
import { useCustomPersonas } from "@/hooks/useCustomPersonas";
import Logo from "@/components/ui/Logo";
import PersonaIcon from "@/components/ui/PersonaIcon";
import type { ChatSession, PersonaId } from "@/types";

// 시스템 영역에서 쓰는 모노크롬 라인 아이콘 — 색을 입히지 않고 currentColor만 따른다.
const StarIcon = ({ className = "h-5 w-5" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M12 3.5l2.6 5.27 5.82.85-4.21 4.1.99 5.78L12 16.77l-5.2 2.73.99-5.78-4.21-4.1 5.82-.85L12 3.5z" />
  </svg>
);
const ChatIcon = ({ className = "h-5 w-5" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M4 5h16v10H8l-4 4V5z" />
  </svg>
);

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
  const [advisorLaunching, setAdvisorLaunching] = useState<PersonaId | null>(null);

  const { map: customPersonaMap, list: customPersonaList } = useCustomPersonas(uid);

  // 세션 구독 — 자문단 미니 클릭 시 기존 AI 세션을 재사용하기 위함
  useEffect(() => {
    if (!uid) return;
    let active = true;
    const unsub = onSessionsSnapshot(uid, (list) => {
      if (!active) return;
      setSessions(list);
    });
    return () => {
      active = false;
      unsub();
    };
  }, [uid]);

  const goFutureSelf = () => {
    if (futureSelfId) router.push(`/chat/${futureSelfId}`);
  };
  const goAdvisors = () => router.push("/chat/advisors");
  const goInbox = () => router.push("/chat/inbox");

  // 자문단 친구 행 클릭: 해당 페르소나의 최근 AI 세션이 있으면 거기로, 없으면 새로 만들고 이동.
  const handleAdvisorRowClick = useCallback(
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

  const friendCount = ADVISOR_PREVIEW_IDS.length + customPersonaList.length;
  const initial = (displayName?.[0] ?? "나").toUpperCase();

  // 카카오톡 친구탭 패턴: 아바타(48px) + 이름 + 한줄 소개 + ›
  // 행 단위 hover 효과, 좌우 패딩은 행 내부에서 균일하게.
  const rowClass =
    "flex w-full items-center gap-3 rounded-[12px] px-2 py-2.5 text-left transition-colors hover:bg-black/[0.03] disabled:opacity-60";

  return (
    <div className="flex-1 overflow-y-auto bg-white">
      {/* 헤더 — Anima 마크 + 날짜 eyebrow + 페이지 제목 */}
      <header className="border-b border-black/[0.06] bg-white px-5 pt-6 pb-3 sm:px-6 sm:pt-8 sm:pb-4">
        <div className="mx-auto max-w-3xl">
          <div className="flex items-center justify-between lg:hidden">
            <Logo variant="lockup" tone="light" size={22} />
          </div>
          <p className="mt-3 text-[11px] font-medium uppercase tracking-[0.08em] text-black/40 lg:mt-0">
            {todayKoreanLabel()}
          </p>
          <h1 className="mt-1 text-[24px] font-semibold leading-[1.14] tracking-[-0.005em] text-[#1E1B4B] sm:text-[26px]">
            홈
          </h1>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-3 pb-10 sm:px-4">
        {/* 내 프로필 — 카카오톡 친구탭 본인 행 */}
        <section className="border-b border-black/[0.06] py-3">
          <div className="flex items-center gap-3 px-2 py-1.5">
            <div
              aria-hidden
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#1E1B4B] text-[18px] font-semibold text-white"
            >
              {initial}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[16px] font-semibold tracking-[-0.022em] text-[#1E1B4B]">
                {displayName}
              </p>
              <p className="truncate text-[12px] tracking-[-0.01em] text-black/56">
                오늘도 미래의 나에게 한 걸음 더
              </p>
            </div>
          </div>
        </section>

        {/* 즐겨찾기 — 미래의 나 */}
        <section className="border-b border-black/[0.06] py-3">
          <h2 className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-black/40">
            즐겨찾기
          </h2>
          <button
            type="button"
            onClick={goFutureSelf}
            disabled={!futureSelfId}
            className={rowClass}
          >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#1E1B4B]/10 text-[#1E1B4B]">
              <StarIcon className="h-[22px] w-[22px]" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-semibold tracking-[-0.022em] text-[#1E1B4B]">
                미래의 나
              </p>
              <p className="truncate text-[12px] tracking-[-0.01em] text-black/56">
                오늘 하루를 함께 정리해요
              </p>
            </div>
            <span aria-hidden className="text-[18px] leading-none text-black/30">
              ›
            </span>
          </button>
        </section>

        {/* 친구 (= 내 자문단) */}
        <section className="border-b border-black/[0.06] py-3">
          <div className="mb-1 flex items-center justify-between px-2">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-black/40">
              친구 ({friendCount})
            </h2>
            <button
              type="button"
              onClick={goAdvisors}
              className="text-[12px] font-medium text-[#1E1B4B] hover:underline"
            >
              전체 보기 ›
            </button>
          </div>
          <ul>
            {ADVISOR_PREVIEW_IDS.map((personaId) => {
              const persona = PERSONAS[personaId as keyof typeof PERSONAS];
              const launching = advisorLaunching === personaId;
              return (
                <li key={personaId}>
                  <button
                    type="button"
                    onClick={() => handleAdvisorRowClick(personaId)}
                    disabled={launching || !!advisorLaunching}
                    className={rowClass}
                  >
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#F0EDE6] text-[#1E1B4B]">
                      <PersonaIcon
                        personaId={personaId}
                        fallbackEmoji={persona.icon}
                        photoUrl={persona.photoUrl}
                        className={persona.photoUrl ? "h-12 w-12" : "h-[22px] w-[22px]"}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-semibold tracking-[-0.022em] text-[#1E1B4B]">
                        {persona.name}
                      </p>
                      <p className="line-clamp-1 text-[12px] tracking-[-0.01em] text-black/56">
                        {persona.description}
                      </p>
                    </div>
                    {launching ? (
                      <span className="h-3.5 w-3.5 animate-spin rounded-full border border-black/10 border-t-[#1E1B4B]" />
                    ) : (
                      <span aria-hidden className="text-[18px] leading-none text-black/30">
                        ›
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
            {customPersonaList.map((cp) => {
              const launching = advisorLaunching === cp.id;
              return (
                <li key={cp.id}>
                  <button
                    type="button"
                    onClick={() => handleAdvisorRowClick(cp.id as PersonaId)}
                    disabled={launching || !!advisorLaunching}
                    className={rowClass}
                  >
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#F0EDE6] text-[#1E1B4B] text-[22px]">
                      <PersonaIcon
                        personaId={cp.id}
                        fallbackEmoji={cp.icon}
                        photoUrl={cp.photoUrl}
                        className={cp.photoUrl ? "h-12 w-12" : "h-[22px] w-[22px]"}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-semibold tracking-[-0.022em] text-[#1E1B4B]">
                        {cp.name}
                      </p>
                      <p className="line-clamp-1 text-[12px] tracking-[-0.01em] text-black/56">
                        {cp.description || "내가 만든 멘토"}
                      </p>
                    </div>
                    {launching ? (
                      <span className="h-3.5 w-3.5 animate-spin rounded-full border border-black/10 border-t-[#1E1B4B]" />
                    ) : (
                      <span aria-hidden className="text-[18px] leading-none text-black/30">
                        ›
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
            <li>
              <button
                type="button"
                onClick={goAdvisors}
                className={rowClass}
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-dashed border-black/15 text-[22px] text-black/30">
                  ＋
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-medium tracking-[-0.022em] text-[#1E1B4B]">
                    새 멘토 만들기
                  </p>
                  <p className="text-[12px] tracking-[-0.01em] text-black/56">
                    나만의 AI 자문단을 설계해요
                  </p>
                </div>
                <span aria-hidden className="text-[18px] leading-none text-black/30">
                  ›
                </span>
              </button>
            </li>
          </ul>
        </section>

        {/* 채팅 바로가기 */}
        <section className="py-3">
          <button
            type="button"
            onClick={goInbox}
            className={rowClass}
          >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#F0EDE6] text-[#1E1B4B]">
              <ChatIcon className="h-[22px] w-[22px]" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-semibold tracking-[-0.022em] text-[#1E1B4B]">
                전체 대화 보기
              </p>
              <p className="truncate text-[12px] tracking-[-0.01em] text-black/56">
                친구·자문단과 나눈 모든 대화
              </p>
            </div>
            <span aria-hidden className="text-[18px] leading-none text-black/30">
              ›
            </span>
          </button>
        </section>
      </div>
    </div>
  );
}
