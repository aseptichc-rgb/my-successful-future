"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useChat } from "@/hooks/useChat";
import { useAutoNews } from "@/hooks/useAutoNews";
import { useKeywordAlert } from "@/hooks/useKeywordAlert";
import { useDailyRitual } from "@/hooks/useDailyRitual";
import { useCustomPersonas } from "@/hooks/useCustomPersonas";
import ChatWindow from "@/components/chat/ChatWindow";
import TopicSelector from "@/components/chat/TopicSelector";
import PersonaSelector from "@/components/chat/PersonaSelector";
import ParticipantsBadge from "@/components/chat/ParticipantsBadge";
import InviteModal from "@/components/chat/InviteModal";
import ShareInviteModal from "@/components/chat/ShareInviteModal";
import InvitationBell from "@/components/chat/InvitationBell";
import UserPersonaModal from "@/components/chat/UserPersonaModal";
import FuturePersonaModal from "@/components/chat/FuturePersonaModal";
import AutoNewsPanel from "@/components/chat/AutoNewsPanel";
import KeywordAlertPanel from "@/components/chat/KeywordAlertPanel";
import DailyRitualSettings from "@/components/chat/DailyRitualSettings";
import CouncilLauncher from "@/components/chat/CouncilLauncher";
import ActiveDebateBanner from "@/components/chat/ActiveDebateBanner";
import PeerAssistPanel from "@/components/chat/PeerAssistPanel";
import NewChatModal from "@/components/chat/NewChatModal";
import ChatInput, { type ChatInputHandle } from "@/components/chat/ChatInput";
import AttachedDocsPanel from "@/components/chat/AttachedDocsPanel";
import ReferenceDocsPanel from "@/components/chat/ReferenceDocsPanel";
import PresenceIndicator from "@/components/chat/PresenceIndicator";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { updateUserPersona, updateFuturePersona, clearUnreadCount, updatePresence, deleteSession } from "@/lib/firebase";
import { getPersona } from "@/lib/personas";
import { getAuth as getFirebaseAuth } from "firebase/auth";
import type { PersonaId } from "@/types";

export default function ChatSessionPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, firebaseUser, loading: authLoading, signOut, refreshUser } = useAuth();
  const sessionId = params.sessionId as string;
  const initialPersona = (searchParams?.get("persona") as PersonaId | null) || undefined;

  const currentUid = firebaseUser?.uid;
  const currentName = user?.displayName || firebaseUser?.displayName || "사용자";
  const userPersona = user?.userPersona || "";
  const futurePersona = user?.futurePersona || "";
  const userMemory = user?.userMemory || "";

  // 커스텀 페르소나 맵
  const { map: customPersonaMap } = useCustomPersonas(currentUid);

  const {
    messages, isLoading, error, selectedTopic,
    activePersonas, respondingPersona, respondingConversationPersona, session,
    sessionType, isDirectChat,
    mood,
    sendMessage, sendCouncilQuestion, setSelectedTopic, togglePersona, dismissAI,
    activeCouncil, startNewsDebate, advanceCouncil, addUserToCouncil, endCouncil,
    personaMemories,
  } = useChat(
    sessionId,
    currentUid,
    currentName,
    userPersona,
    futurePersona,
    userMemory,
    () => { refreshUser().catch(() => {}); }, // 메모리 업데이트 후 user 프로필 리프레시
    initialPersona, // 자문단 카드에서 진입 시 ?persona= 로 전달된 페르소나
    customPersonaMap, // 커스텀 페르소나 맵
  );
  void personaMemories;

  const isFutureSelfSession = sessionType === "future-self";

  // 데일리 리추얼 (미래의 나 세션에서만 폴링)
  const {
    config: dailyRitualConfig,
    updateConfig: updateDailyRitualConfig,
  } = useDailyRitual(
    isFutureSelfSession ? currentUid : undefined,
    isFutureSelfSession ? sessionId : undefined,
    {
      userPersona,
      futurePersona,
      userMemory,
      mood,
    }
  );

  // 자동 뉴스 훅 (future-self 세션이면 사용자 미래/현재 자기소개 함께 전달)
  const {
    config: autoNewsConfig,
    isChecking: isAutoNewsChecking,
    lastCheckResult,
    toggleAutoNews,
    togglePersona: toggleAutoNewsPersona,
    setCustomTopics,
    setInterval: setAutoNewsInterval,
    manualCheck,
  } = useAutoNews(sessionId, {
    futurePersona: futurePersona || undefined,
    currentPersona: userPersona || undefined,
  });

  // 키워드 알림 훅 (페르소나 불필요, 순수 키워드 기반)
  const {
    config: keywordAlertConfig,
    isChecking: isKeywordAlertChecking,
    lastCheckResult: keywordAlertLastResult,
    toggleEnabled: toggleKeywordAlert,
    setKeywords: setKeywordAlertKeywords,
    setIntervalMinutes: setKeywordAlertInterval,
    manualCheck: keywordAlertManualCheck,
    setScheduledEnabled: setKeywordAlertScheduledEnabled,
    addScheduledTime: addKeywordAlertScheduledTime,
    removeScheduledTime: removeKeywordAlertScheduledTime,
  } = useKeywordAlert(sessionId);

  const MAX_INPUT_LENGTH = 500;
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showPersonaModal, setShowPersonaModal] = useState(false);
  const [showFuturePersonaModal, setShowFuturePersonaModal] = useState(false);
  const [showAutoNewsPanel, setShowAutoNewsPanel] = useState(false);
  const [showKeywordAlertPanel, setShowKeywordAlertPanel] = useState(false);
  const [showDailyRitualSettings, setShowDailyRitualSettings] = useState(false);
  const [showCouncilLauncher, setShowCouncilLauncher] = useState(false);
  const [showPeerAssist, setShowPeerAssist] = useState(false);
  const [showAlertChooser, setShowAlertChooser] = useState(false);
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);

  // 입력창은 별도 컴포넌트로 격리되어 있고, 타이핑이 이 페이지를 리렌더하지 않는다.
  // 외부(예: PeerAssist 답장 반영)에서 input에 값을 추가해야 하는 경우에만 ref로 접근한다.
  const chatInputRef = useRef<ChatInputHandle>(null);

  useEffect(() => {
    if (!authLoading && !firebaseUser) {
      router.push("/login");
    }
  }, [authLoading, firebaseUser, router]);

  // 최초 진입 실시간 브리프 (personaSchedules 가 켜져 있고 당일 브리프가 없으면 한 번 생성)
  useEffect(() => {
    if (!sessionId || !currentUid || !initialPersona) return;
    let cancelled = false;
    (async () => {
      try {
        const user = getFirebaseAuth().currentUser;
        if (!user) return;
        const token = await user.getIdToken().catch(() => null);
        if (!token || cancelled) return;
        await fetch("/api/persona-brief", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ sessionId, personaId: String(initialPersona) }),
        });
      } catch (err) {
        // 브리프 생성은 보조 기능 — 실패해도 채팅방 진입 자체는 계속 진행
        console.warn("[persona-brief] 요청 실패:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId, currentUid, initialPersona]);

  // 세션 진입 시 안읽은 메시지 초기화 + 프레즌스 업데이트
  useEffect(() => {
    if (!sessionId || !currentUid) return;
    clearUnreadCount(sessionId, currentUid).catch(() => {});
    updatePresence(currentUid, true, sessionId).catch(() => {});

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        clearUnreadCount(sessionId, currentUid).catch(() => {});
        updatePresence(currentUid, true, sessionId).catch(() => {});
      } else {
        updatePresence(currentUid, true).catch(() => {});
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      updatePresence(currentUid, true).catch(() => {});
    };
  }, [sessionId, currentUid]);

  // 라이브 토론이 진행 중이면 사용자 발언은 토론 끼어들기로 처리
  const handleChatSubmit = useCallback(
    async (text: string) => {
      if (activeCouncil) {
        await addUserToCouncil(text);
      } else {
        await sendMessage(text);
      }
    },
    [activeCouncil, addUserToCouncil, sendMessage],
  );

  const inputPlaceholder = activeCouncil
    ? "토론에 끼어들어 의견을 남기세요"
    : isFutureSelfSession
      ? "미래의 나에게 무엇이든 물어보세요"
      : isDirectChat
        ? "메시지 입력 (@로 AI 호출)"
        : "@로 페르소나를 멘션하세요";

  // 새 대화 만들기 → DM/그룹 채팅 선택 모달
  const handleNewChat = () => {
    setShowNewChatModal(true);
  };

  const handleSignOut = async () => {
    await signOut();
    router.push("/login");
  };

  // 다중 참여자 → 나가기 / 단독 → 삭제. 미래의 나 세션은 비허용.
  const participantCount = session?.participants?.length || 1;
  const isLeaveOnly = participantCount > 1;
  const canLeaveOrDelete = !isFutureSelfSession && !!sessionId && !!currentUid;

  const handleConfirmLeaveOrDelete = useCallback(async () => {
    if (!canLeaveOrDelete || !currentUid) return;
    setIsLeaving(true);
    try {
      await deleteSession(sessionId, currentUid);
      setShowLeaveConfirm(false);
      router.push("/chat");
    } catch (err) {
      console.error("세션 나가기/삭제 실패:", err);
      window.alert(
        isLeaveOnly
          ? "대화방 나가기에 실패했습니다. 잠시 후 다시 시도해주세요."
          : "대화 삭제에 실패했습니다. 잠시 후 다시 시도해주세요.",
      );
    } finally {
      setIsLeaving(false);
    }
  }, [canLeaveOrDelete, currentUid, sessionId, router, isLeaveOnly]);

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-black/10 border-t-[#0071e3]" />
      </div>
    );
  }

  const isMultiUser = session?.participants && session.participants.length > 1;

  return (
    <div className="flex h-full flex-col bg-white">
      {/* 헤더 — Apple 글라스 */}
      <header className="nav-glass sticky top-0 z-10 flex flex-col gap-2 border-b border-black/[0.06] px-3 py-2 sm:flex-row sm:items-center sm:justify-between sm:px-4 sm:py-3">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <h1 className="max-w-[60vw] truncate text-[17px] font-semibold tracking-[-0.022em] text-[#1d1d1f] sm:max-w-none sm:text-[19px]">
            {isFutureSelfSession ? (
              <>🌟 미래의 나와의 대화</>
            ) : isDirectChat ? (
              <>
                {sessionType === "dm" ? "💬" : "👥"}{" "}
                {session?.title || "대화"}
              </>
            ) : (
              "AI 뉴스 챗봇"
            )}
          </h1>
          {!isFutureSelfSession && (
            <PersonaSelector
              activePersonas={activePersonas}
              onToggle={togglePersona}
              customPersonas={customPersonaMap}
            />
          )}
          {!isFutureSelfSession && session?.participantNames && currentUid && (
            <>
              <ParticipantsBadge
                participantNames={session.participantNames}
                ownerUid={session.uid}
                currentUid={currentUid}
              />
              {session.participants && session.participants.length > 1 && (
                <PresenceIndicator uids={session.participants} />
              )}
            </>
          )}
          {isFutureSelfSession && !futurePersona && (
            <span className="rounded-pill bg-[#0071e3]/10 px-2.5 py-0.5 text-[11px] font-medium tracking-[-0.01em] text-[#0071e3]">
              미래의 나를 먼저 정의해주세요 →
            </span>
          )}
          {/* 감정 상태 뱃지 */}
          {isFutureSelfSession && mood !== "unknown" && (
            <span
              className="rounded-pill bg-black/[0.06] px-2.5 py-0.5 text-[11px] font-medium tracking-[-0.01em] text-black/70"
              title="최근 대화 기반 자동 감지"
            >
              {mood === "warm" && "☁️ 안정적"}
              {mood === "stressed" && "💧 긴장된"}
              {mood === "flat" && "🌫️ 평온한"}
              {mood === "elated" && "☀️ 활기찬"}
            </span>
          )}
        </div>
        <div className="-mx-1 flex items-center gap-1.5 overflow-x-auto whitespace-nowrap px-1 hide-scrollbar sm:mx-0 sm:gap-2 sm:overflow-visible sm:px-0">
          {/* 미래의 나 정의 */}
          {isFutureSelfSession && (
            <button
              onClick={() => setShowFuturePersonaModal(true)}
              className={`shrink-0 rounded-pill px-3.5 py-1.5 text-[13px] font-medium tracking-[-0.01em] transition-colors ${
                futurePersona
                  ? "bg-[#f5f5f7] text-black/80 hover:bg-black/[0.06]"
                  : "bg-[#0071e3] text-white hover:bg-[#0077ed] animate-pulse"
              }`}
              title="미래의 나 정의"
            >
              🌟<span className="hidden sm:inline"> 미래의 나</span>
            </button>
          )}

          {/* 데일리 리추얼 */}
          {isFutureSelfSession && (
            <button
              onClick={() => setShowDailyRitualSettings(true)}
              className={`shrink-0 rounded-pill px-3.5 py-1.5 text-[13px] font-medium tracking-[-0.01em] transition-colors ${
                dailyRitualConfig?.enabled
                  ? "bg-[#0071e3]/10 text-[#0071e3] hover:bg-[#0071e3]/15"
                  : "bg-[#f5f5f7] text-black/80 hover:bg-black/[0.06]"
              }`}
              title="데일리 리추얼 설정"
            >
              ☀️<span className="hidden sm:inline"> 리추얼</span>
            </button>
          )}

          {/* 카운슬 소집 */}
          {(!isDirectChat || isFutureSelfSession) && (
            <button
              onClick={() => setShowCouncilLauncher(true)}
              className="shrink-0 rounded-pill bg-[#f5f5f7] px-3.5 py-1.5 text-[13px] font-medium tracking-[-0.01em] text-black/80 transition-colors hover:bg-black/[0.06]"
              title="카운슬 소집"
            >
              🪑<span className="hidden sm:inline"> 카운슬</span>
            </button>
          )}

          {/* AI 도우미 */}
          {isDirectChat && (
            <button
              onClick={() => setShowPeerAssist(true)}
              className="shrink-0 rounded-pill bg-[#f5f5f7] px-3.5 py-1.5 text-[13px] font-medium tracking-[-0.01em] text-black/80 transition-colors hover:bg-black/[0.06]"
              title="AI 도우미 — 요약 · 답장 제안 · 번역"
            >
              🤖<span className="hidden sm:inline"> AI 도우미</span>
            </button>
          )}

          {/* 내 페르소나 설정 */}
          {(!isDirectChat || isFutureSelfSession) && (
            <button
              onClick={() => setShowPersonaModal(true)}
              className={`shrink-0 rounded-pill px-3 py-1.5 transition-colors ${
                userPersona
                  ? "bg-[#0071e3]/10 text-[#0071e3] hover:bg-[#0071e3]/15"
                  : "bg-[#f5f5f7] text-black/70 hover:bg-black/[0.06]"
              }`}
              title={isFutureSelfSession ? "현재의 나 (보조 정보)" : "내 페르소나 설정"}
            >
              <svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </button>
          )}

          {/* 자동 알림 */}
          {(!isDirectChat || isFutureSelfSession) && (
            <button
              onClick={() => {
                if (isFutureSelfSession) {
                  setShowAutoNewsPanel(true);
                } else {
                  setShowAlertChooser(true);
                }
              }}
              className={`shrink-0 rounded-pill px-3 py-1.5 transition-colors ${
                autoNewsConfig?.enabled || keywordAlertConfig?.enabled
                  ? "bg-[#0071e3]/10 text-[#0071e3] hover:bg-[#0071e3]/15"
                  : "bg-[#f5f5f7] text-black/70 hover:bg-black/[0.06]"
              }`}
              title={isFutureSelfSession ? "자동 메시지 설정" : "자동 알림 설정"}
            >
              <div className="flex items-center gap-1">
                <svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                {(autoNewsConfig?.enabled || keywordAlertConfig?.enabled) && (isAutoNewsChecking || isKeywordAlertChecking) && (
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#0071e3]" />
                )}
              </div>
            </button>
          )}

          {/* 초대 */}
          {!isFutureSelfSession && (
            <button
              onClick={() => setShowInviteModal(true)}
              className="shrink-0 rounded-pill bg-[#f5f5f7] px-3 py-1.5 text-black/70 transition-colors hover:bg-black/[0.06]"
              title="사용자 초대"
            >
              <svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
              </svg>
            </button>
          )}

          {/* 링크 공유 */}
          {!isFutureSelfSession && (
            <button
              onClick={() => setShowShareModal(true)}
              className="shrink-0 rounded-pill bg-[#f5f5f7] px-3 py-1.5 text-black/70 transition-colors hover:bg-black/[0.06]"
              title="초대 링크 공유"
            >
              <svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
              </svg>
            </button>
          )}

          {/* 초대 알림 벨 */}
          {currentUid && (
            <InvitationBell uid={currentUid} displayName={currentName} />
          )}

          <button
            onClick={() => router.push("/chat")}
            className="hidden shrink-0 rounded-pill bg-[#f5f5f7] px-3 py-1.5 text-black/70 transition-colors hover:bg-black/[0.06] sm:inline-flex"
            title="홈으로"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-[18px] w-[18px]" viewBox="0 0 20 20" fill="currentColor">
              <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
            </svg>
          </button>
          <button
            onClick={handleNewChat}
            className="hidden shrink-0 rounded-pill bg-[#f5f5f7] px-3.5 py-1.5 text-[13px] font-medium tracking-[-0.01em] text-black/80 transition-colors hover:bg-black/[0.06] sm:inline-flex"
          >
            새 대화
          </button>
          {canLeaveOrDelete && (
            <button
              onClick={() => setShowLeaveConfirm(true)}
              className="shrink-0 rounded-pill px-3 py-1.5 text-[13px] font-medium tracking-[-0.01em] text-[#ff3b30] transition-colors hover:bg-[#ff3b30]/10"
              title={isLeaveOnly ? "대화방 나가기" : "대화 삭제"}
              aria-label={isLeaveOnly ? "대화방 나가기" : "대화 삭제"}
            >
              <span className="sm:hidden">
                <svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {isLeaveOnly ? (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  )}
                </svg>
              </span>
              <span className="hidden sm:inline">{isLeaveOnly ? "나가기" : "삭제"}</span>
            </button>
          )}
          <button
            onClick={handleSignOut}
            className="hidden shrink-0 px-3 py-1.5 text-[13px] font-medium tracking-[-0.01em] text-black/48 transition-colors hover:text-black/70 sm:inline-flex"
          >
            로그아웃
          </button>
        </div>
      </header>

      {/* 도메인 필터 (AI 세션만, future-self 제외) */}
      {!isDirectChat && !isFutureSelfSession && (
        <TopicSelector selected={selectedTopic} onChange={setSelectedTopic} />
      )}

      {/* 채팅 영역 — 빈 대화방 안내는 세션 성격에 맞춰 커스터마이즈 */}
      {(() => {
        let emptyTitle: string | undefined;
        let emptySubtitle: string | undefined;
        if (isFutureSelfSession) {
          emptyTitle = "🌟 미래의 나";
          emptySubtitle = "오늘 하루를 함께 정리해봐요.";
        } else if (isDirectChat) {
          emptyTitle = session?.title || "대화";
          emptySubtitle = "첫 메시지를 남겨보세요.";
        } else {
          const nonDefault = activePersonas.filter((p) => p !== "default");
          if (nonDefault.length >= 2) {
            const names = nonDefault
              .slice(0, 3)
              .map((id) => getPersona(id, customPersonaMap).name)
              .join(", ");
            const more = nonDefault.length > 3 ? ` 외 ${nonDefault.length - 3}명` : "";
            emptyTitle = `🧭 ${names}${more}`;
            emptySubtitle = "질문을 남기면 가장 적합한 자문단이 답해드려요.";
          } else if (nonDefault.length === 1) {
            const p = getPersona(nonDefault[0], customPersonaMap);
            emptyTitle = `${p.icon} ${p.name}`;
            emptySubtitle = p.description || "전문가 관점의 조언을 받아보세요.";
          }
        }
        return (
          <ChatWindow
            messages={messages}
            isLoading={isLoading}
            respondingPersona={respondingPersona}
            customPersonaMap={customPersonaMap}
            emptyTitle={emptyTitle}
            emptySubtitle={emptySubtitle}
          />
        );
      })()}

      {/* 에러 메시지 */}
      {error && (
        <div className="px-4 py-2 text-center text-[13px] tracking-[-0.01em] text-[#ff3b30]">
          {error}
        </div>
      )}

      {/* AI 대화 진행 중 표시 */}
      {isDirectChat && respondingConversationPersona && (
        <div className="flex items-center justify-between border-t border-[#0071e3]/15 bg-[#0071e3]/8 px-4 py-2.5">
          <p className="text-[12px] tracking-[-0.01em] text-[#0071e3]">
            🤖 AI 페르소나가 대화에 참여 중 — 메시지를 보내면 계속 응답합니다
          </p>
          <button
            onClick={dismissAI}
            className="shrink-0 rounded-pill px-3 py-1 text-[12px] font-medium text-[#0071e3] transition-colors hover:bg-[#0071e3]/10"
          >
            AI 종료
          </button>
        </div>
      )}

      {/* 첨부 문서 패널 (Claude 결과물 등) */}
      {currentUid && (
        <>
          <AttachedDocsPanel
            sessionId={sessionId}
            currentUid={currentUid}
            currentName={currentName}
          />
          <ReferenceDocsPanel />
        </>
      )}

      {/* 입력 영역 — Apple 글라스 */}
      <div className={`nav-glass border-t border-black/[0.06] px-3 py-2.5 sm:px-4 sm:py-3 ${isDirectChat && respondingConversationPersona ? "border-t-0" : ""}`}>
        {activeCouncil && (
          <ActiveDebateBanner
            council={activeCouncil}
            isLoading={isLoading}
            onAdvance={advanceCouncil}
            onEnd={endCouncil}
            customPersonaMap={customPersonaMap}
          />
        )}
        <ChatInput
          ref={chatInputRef}
          onSubmit={handleChatSubmit}
          disabled={isLoading}
          maxLength={MAX_INPUT_LENGTH}
          placeholder={inputPlaceholder}
          customPersonaMap={customPersonaMap}
        />
      </div>

      {/* 초대 모달 */}
      {showInviteModal && currentUid && (
        <InviteModal
          sessionId={sessionId}
          sessionTitle={session?.title || "대화"}
          fromUid={currentUid}
          fromName={currentName}
          participants={session?.participants || []}
          onClose={() => setShowInviteModal(false)}
        />
      )}

      {/* 링크 공유 모달 */}
      {showShareModal && currentUid && (
        <ShareInviteModal
          sessionId={sessionId}
          sessionTitle={session?.title || "대화"}
          fromUid={currentUid}
          fromName={currentName}
          onClose={() => setShowShareModal(false)}
        />
      )}

      {/* 내 페르소나 설정 모달 */}
      {showPersonaModal && (
        <UserPersonaModal
          currentPersona={userPersona}
          onSave={async (persona) => {
            if (currentUid) {
              await updateUserPersona(currentUid, persona);
              await refreshUser();
            }
          }}
          onClose={() => setShowPersonaModal(false)}
        />
      )}

      {/* 미래의 나 정의 모달 */}
      {showFuturePersonaModal && (
        <FuturePersonaModal
          currentFuturePersona={futurePersona}
          onSave={async (persona) => {
            if (currentUid) {
              await updateFuturePersona(currentUid, persona);
              await refreshUser();
              // 처음 정의되는 경우(이전에 futurePersona가 비어 있었을 때) + future-self 세션이면
              // 자동 메시지 기본 설정을 켜준다 (24시간 주기)
              if (!futurePersona && persona && isFutureSelfSession && !autoNewsConfig?.enabled) {
                if (!autoNewsConfig?.activePersonas?.includes("future-self")) {
                  await toggleAutoNewsPersona("future-self");
                }
                if (autoNewsConfig?.intervalMinutes !== 1440) {
                  await setAutoNewsInterval(1440);
                }
                await toggleAutoNews(true);
              }
            }
          }}
          onClose={() => setShowFuturePersonaModal(false)}
        />
      )}

      {/* 새 대화 모달 (DM/그룹 채팅 만들기 - 다른 사용자 초대) */}
      {showNewChatModal && currentUid && (
        <NewChatModal
          uid={currentUid}
          displayName={currentName}
          onClose={() => setShowNewChatModal(false)}
        />
      )}

      {/* 알림 종류 선택 chooser */}
      {showAlertChooser && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={() => setShowAlertChooser(false)}
        >
          <div
            className="mx-4 w-full max-w-sm rounded-[18px] bg-white p-6 shadow-apple-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-[20px] font-semibold leading-[1.2] tracking-[-0.005em] text-[#1d1d1f]">
                자동 알림 종류
              </h2>
              <button
                onClick={() => setShowAlertChooser(false)}
                className="rounded-full p-1.5 text-black/40 transition-colors hover:bg-black/[0.04] hover:text-black/70"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="space-y-3">
              <button
                onClick={() => {
                  setShowAlertChooser(false);
                  setShowKeywordAlertPanel(true);
                }}
                className="flex w-full items-start gap-3 rounded-[14px] bg-[#f5f5f7] p-4 text-left transition-colors hover:bg-black/[0.06]"
              >
                <span className="text-2xl">🔔</span>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-[15px] font-semibold tracking-[-0.022em] text-[#1d1d1f]">내 키워드 알림</p>
                    {keywordAlertConfig?.enabled && (
                      <span className="rounded-pill bg-[#0071e3] px-2 py-0.5 text-[10px] font-semibold tracking-[0.04em] text-white">ON</span>
                    )}
                  </div>
                  <p className="mt-0.5 text-[12px] leading-[1.4] tracking-[-0.01em] text-black/60">
                    내가 등록한 키워드의 새 뉴스를 주기적으로 검색해서 알려줍니다.
                  </p>
                </div>
              </button>
              <button
                onClick={() => {
                  setShowAlertChooser(false);
                  setShowAutoNewsPanel(true);
                }}
                className="flex w-full items-start gap-3 rounded-[14px] bg-[#f5f5f7] p-4 text-left transition-colors hover:bg-black/[0.06]"
              >
                <span className="text-2xl">🤖</span>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-[15px] font-semibold tracking-[-0.022em] text-[#1d1d1f]">AI 페르소나 자동 뉴스</p>
                    {autoNewsConfig?.enabled && (
                      <span className="rounded-pill bg-[#0071e3] px-2 py-0.5 text-[10px] font-semibold tracking-[0.04em] text-white">ON</span>
                    )}
                  </div>
                  <p className="mt-0.5 text-[12px] leading-[1.4] tracking-[-0.01em] text-black/60">
                    선택한 AI 전문가가 자기 분야의 새 뉴스를 자동으로 공유합니다.
                  </p>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 키워드 알림 설정 패널 */}
      {showKeywordAlertPanel && (
        <KeywordAlertPanel
          config={keywordAlertConfig}
          isChecking={isKeywordAlertChecking}
          lastCheckResult={keywordAlertLastResult}
          onToggle={toggleKeywordAlert}
          onSetKeywords={setKeywordAlertKeywords}
          onSetInterval={setKeywordAlertInterval}
          onManualCheck={keywordAlertManualCheck}
          onClose={() => setShowKeywordAlertPanel(false)}
          onToggleScheduled={setKeywordAlertScheduledEnabled}
          onAddScheduledTime={addKeywordAlertScheduledTime}
          onRemoveScheduledTime={removeKeywordAlertScheduledTime}
        />
      )}

      {/* 자동 뉴스 설정 패널 */}
      {showAutoNewsPanel && (
        <AutoNewsPanel
          config={autoNewsConfig}
          isChecking={isAutoNewsChecking}
          lastCheckResult={lastCheckResult}
          onToggle={async (enabled) => {
            // future-self 세션에서는 활성화 시 자동으로 future-self 페르소나를 등록
            if (isFutureSelfSession && enabled && !autoNewsConfig?.activePersonas?.includes("future-self")) {
              await toggleAutoNewsPersona("future-self");
            }
            await toggleAutoNews(enabled);
          }}
          onTogglePersona={toggleAutoNewsPersona}
          onSetCustomTopics={setCustomTopics}
          onSetInterval={setAutoNewsInterval}
          onManualCheck={manualCheck}
          onClose={() => setShowAutoNewsPanel(false)}
          futureSelfMode={isFutureSelfSession}
          futurePersonaSet={!!futurePersona}
        />
      )}

      {/* 데일리 리추얼 설정 패널 */}
      {showDailyRitualSettings && isFutureSelfSession && (
        <DailyRitualSettings
          config={dailyRitualConfig}
          onUpdate={updateDailyRitualConfig}
          onClose={() => setShowDailyRitualSettings(false)}
        />
      )}

      {/* 카운슬 런처 */}
      {showCouncilLauncher && (
        <CouncilLauncher
          onLaunch={async (q, ids, mode) => {
            if (mode === "live") {
              await startNewsDebate(ids, q);
            } else {
              await sendCouncilQuestion(q, ids);
            }
          }}
          onClose={() => setShowCouncilLauncher(false)}
          disabled={isLoading}
        />
      )}

      {/* 피어 채팅 AI 도우미 (DM/그룹 전용, 프라이빗) */}
      {showPeerAssist && isDirectChat && (
        <PeerAssistPanel
          messages={messages}
          currentUid={currentUid}
          currentUserName={currentName}
          userPersona={userPersona}
          onClose={() => setShowPeerAssist(false)}
          onUseReply={(text) => {
            chatInputRef.current?.appendText(text);
          }}
        />
      )}

      {/* 나가기 / 삭제 확인 다이얼로그 */}
      <ConfirmDialog
        open={showLeaveConfirm}
        title={isLeaveOnly ? "대화방에서 나갈까요?" : "대화를 삭제할까요?"}
        description={
          isLeaveOnly
            ? `"${session?.title || "이 대화"}"에서 나가면 더 이상 새 메시지를 받을 수 없습니다.`
            : `"${session?.title || "이 대화"}"의 모든 메시지가 함께 삭제되며 되돌릴 수 없습니다.`
        }
        confirmLabel={isLeaveOnly ? "나가기" : "삭제"}
        cancelLabel="취소"
        destructive
        loading={isLeaving}
        onConfirm={handleConfirmLeaveOrDelete}
        onCancel={() => {
          if (!isLeaving) setShowLeaveConfirm(false);
        }}
      />
    </div>
  );
}
