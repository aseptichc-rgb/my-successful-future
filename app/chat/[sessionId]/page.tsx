"use client";

import { useState, useRef, useCallback, type FormEvent, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useChat } from "@/hooks/useChat";
import { useAutoNews } from "@/hooks/useAutoNews";
import ChatWindow from "@/components/chat/ChatWindow";
import TopicSelector from "@/components/chat/TopicSelector";
import PersonaSelector from "@/components/chat/PersonaSelector";
import ParticipantsBadge from "@/components/chat/ParticipantsBadge";
import InviteModal from "@/components/chat/InviteModal";
import ShareInviteModal from "@/components/chat/ShareInviteModal";
import InvitationBell from "@/components/chat/InvitationBell";
import UserPersonaModal from "@/components/chat/UserPersonaModal";
import AutoNewsPanel from "@/components/chat/AutoNewsPanel";
import MentionDropdown, { getFilteredPersonas } from "@/components/chat/MentionDropdown";
import PresenceIndicator from "@/components/chat/PresenceIndicator";
import { updateUserPersona, clearUnreadCount, updatePresence } from "@/lib/firebase";
import type { PersonaId } from "@/types";

export default function ChatSessionPage() {
  const params = useParams();
  const router = useRouter();
  const { user, firebaseUser, loading: authLoading, signOut, refreshUser } = useAuth();
  const sessionId = params.sessionId as string;

  const currentUid = firebaseUser?.uid;
  const currentName = user?.displayName || firebaseUser?.displayName || "사용자";
  const userPersona = user?.userPersona || "";

  const {
    messages, isLoading, error, selectedTopic,
    activePersonas, respondingPersona, respondingConversationPersona, session,
    sessionType, isDirectChat,
    sendMessage, setSelectedTopic, togglePersona, dismissAI,
  } = useChat(sessionId, currentUid, currentName, userPersona);

  // 자동 뉴스 훅
  const {
    config: autoNewsConfig,
    isChecking: isAutoNewsChecking,
    lastCheckResult,
    toggleAutoNews,
    togglePersona: toggleAutoNewsPersona,
    setCustomTopics,
    setInterval: setAutoNewsInterval,
    manualCheck,
  } = useAutoNews(sessionId);

  const [input, setInput] = useState("");
  const MAX_INPUT_LENGTH = 500;
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showPersonaModal, setShowPersonaModal] = useState(false);
  const [showAutoNewsPanel, setShowAutoNewsPanel] = useState(false);

  // 멘션 관련 상태
  const [showMention, setShowMention] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionIndex, setMentionIndex] = useState(0);
  const [mentionStart, setMentionStart] = useState(-1);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 입력 변경 시 @ 감지
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    const cursorPos = e.target.selectionStart;
    setInput(value);

    // 커서 위치 기준으로 @ 찾기
    const textBeforeCursor = value.slice(0, cursorPos);
    const lastAtIndex = textBeforeCursor.lastIndexOf("@");

    if (lastAtIndex !== -1) {
      const charBeforeAt = lastAtIndex > 0 ? textBeforeCursor[lastAtIndex - 1] : " ";
      const query = textBeforeCursor.slice(lastAtIndex + 1);
      // @ 앞이 공백이거나 문장 시작이고, 쿼리에 공백이 없을 때
      if ((charBeforeAt === " " || charBeforeAt === "\n" || lastAtIndex === 0) && !query.includes(" ")) {
        const filtered = getFilteredPersonas(query);
        if (filtered.length > 0) {
          setShowMention(true);
          setMentionQuery(query);
          setMentionStart(lastAtIndex);
          setMentionIndex(0);
          return;
        }
      }
    }
    setShowMention(false);
  }, []);

  // 멘션 선택 시
  const handleMentionSelect = useCallback((personaId: PersonaId, personaName: string) => {
    const before = input.slice(0, mentionStart);
    const after = input.slice(mentionStart + 1 + mentionQuery.length);
    const newInput = `${before}@${personaName} ${after}`;
    setInput(newInput);
    setShowMention(false);
    textareaRef.current?.focus();
  }, [input, mentionStart, mentionQuery]);

  useEffect(() => {
    if (!authLoading && !firebaseUser) {
      router.push("/login");
    }
  }, [authLoading, firebaseUser, router]);

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

  const isOverLimit = input.length > MAX_INPUT_LENGTH;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isOverLimit) return;

    const message = input;
    setInput("");
    await sendMessage(message);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showMention) {
      const filtered = getFilteredPersonas(mentionQuery);
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionIndex((prev) => (prev + 1) % filtered.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionIndex((prev) => (prev - 1 + filtered.length) % filtered.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        const selected = filtered[mentionIndex];
        if (selected) handleMentionSelect(selected.id, selected.name);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setShowMention(false);
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleNewChat = () => {
    router.push("/chat");
  };

  const handleSignOut = async () => {
    await signOut();
    router.push("/login");
  };

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600" />
      </div>
    );
  }

  const isMultiUser = session?.participants && session.participants.length > 1;

  return (
    <div className="flex h-full flex-col bg-white">
      {/* 헤더 */}
      <header className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold text-gray-900">
            {isDirectChat ? (
              <>
                {sessionType === "dm" ? "💬" : "👥"}{" "}
                {session?.title || "대화"}
              </>
            ) : (
              "AI 뉴스 챗봇"
            )}
          </h1>
          <PersonaSelector activePersonas={activePersonas} onToggle={togglePersona} />
          {session?.participantNames && currentUid && (
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
        </div>
        <div className="flex items-center gap-2">
          {/* 내 페르소나 설정 버튼 (AI 세션만) */}
          {!isDirectChat && (
            <button
              onClick={() => setShowPersonaModal(true)}
              className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                userPersona
                  ? "border-purple-300 bg-purple-50 text-purple-700 hover:bg-purple-100"
                  : "border-gray-300 text-gray-700 hover:bg-gray-50"
              }`}
              title="내 페르소나 설정"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </button>
          )}

          {/* 자동 뉴스 설정 버튼 (AI 세션만) */}
          {!isDirectChat && (
            <button
              onClick={() => setShowAutoNewsPanel(true)}
              className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                autoNewsConfig?.enabled
                  ? "border-green-300 bg-green-50 text-green-700 hover:bg-green-100"
                  : "border-gray-300 text-gray-700 hover:bg-gray-50"
              }`}
              title="자동 뉴스 설정"
            >
              <div className="flex items-center gap-1">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                {autoNewsConfig?.enabled && isAutoNewsChecking && (
                  <span className="h-2 w-2 animate-pulse rounded-full bg-green-500" />
                )}
              </div>
            </button>
          )}

          {/* 초대 버튼 */}
          <button
            onClick={() => setShowInviteModal(true)}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            title="사용자 초대"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
            </svg>
          </button>

          {/* 링크 공유 버튼 */}
          <button
            onClick={() => setShowShareModal(true)}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            title="초대 링크 공유"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
            </svg>
          </button>

          {/* 초대 알림 벨 */}
          {currentUid && (
            <InvitationBell uid={currentUid} displayName={currentName} />
          )}

          <button
            onClick={() => router.push("/")}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            title="홈으로"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
            </svg>
          </button>
          <button
            onClick={handleNewChat}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
          >
            새 대화
          </button>
          <button
            onClick={handleSignOut}
            className="rounded-lg px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-50 transition-colors"
          >
            로그아웃
          </button>
        </div>
      </header>

      {/* 도메인 필터 (AI 세션만) */}
      {!isDirectChat && (
        <TopicSelector selected={selectedTopic} onChange={setSelectedTopic} />
      )}

      {/* 채팅 영역 */}
      <ChatWindow messages={messages} isLoading={isLoading} respondingPersona={respondingPersona} />

      {/* 글자수 초과 경고 */}
      {isOverLimit && (
        <div className="px-4 py-2 text-center text-sm text-red-600">
          ⚠️ 메시지는 {MAX_INPUT_LENGTH}자 이내로 입력해주세요. (현재 {input.length}자)
        </div>
      )}

      {/* 에러 메시지 */}
      {error && (
        <div className="px-4 py-2 text-center text-sm text-red-600">
          {error}
        </div>
      )}

      {/* AI 대화 진행 중 표시 (DM/그룹에서 AI가 참여 중일 때) */}
      {isDirectChat && respondingConversationPersona && (
        <div className="flex items-center justify-between border-t border-blue-100 bg-blue-50 px-4 py-2">
          <p className="text-xs text-blue-700">
            🤖 AI 페르소나가 대화에 참여 중 — 메시지를 보내면 계속 응답합니다
          </p>
          <button
            onClick={dismissAI}
            className="shrink-0 rounded-md px-2 py-1 text-xs text-blue-600 hover:bg-blue-100 transition-colors"
          >
            AI 종료
          </button>
        </div>
      )}

      {/* 입력 영역 */}
      <div className={`border-t border-gray-200 px-4 py-3 ${isDirectChat && respondingConversationPersona ? "border-t-0" : ""}`}>
        <form
          onSubmit={handleSubmit}
          className="mx-auto flex max-w-3xl items-end gap-3"
        >
          <div className="relative flex-1">
            {showMention && (
              <MentionDropdown
                query={mentionQuery}
                onSelect={handleMentionSelect}
                onClose={() => setShowMention(false)}
                selectedIndex={mentionIndex}
              />
            )}
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              onBlur={() => {
                // 약간의 딜레이로 클릭 이벤트가 먼저 처리되도록
                setTimeout(() => setShowMention(false), 200);
              }}
              maxLength={MAX_INPUT_LENGTH + 50}
              placeholder={isDirectChat ? "메시지를 입력하세요... (@로 AI 호출)" : "@를 입력하여 페르소나를 멘션하세요..."}
              rows={1}
              className={`w-full resize-none rounded-xl border px-4 py-3 text-sm text-gray-900 focus:outline-none focus:ring-1 ${
                isOverLimit
                  ? "border-red-400 focus:border-red-500 focus:ring-red-500"
                  : "border-gray-300 focus:border-blue-500 focus:ring-blue-500"
              }`}
            />
            <div className={`absolute bottom-1 right-2 text-xs ${
              isOverLimit ? "text-red-500 font-semibold" : input.length > MAX_INPUT_LENGTH * 0.8 ? "text-yellow-500" : "text-gray-400"
            }`}>
              {input.length}/{MAX_INPUT_LENGTH}
            </div>
          </div>
          <button
            type="submit"
            disabled={isLoading || !input.trim() || isOverLimit}
            className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            전송
          </button>
        </form>
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

      {/* 자동 뉴스 설정 패널 */}
      {showAutoNewsPanel && (
        <AutoNewsPanel
          config={autoNewsConfig}
          isChecking={isAutoNewsChecking}
          lastCheckResult={lastCheckResult}
          onToggle={toggleAutoNews}
          onTogglePersona={toggleAutoNewsPersona}
          onSetCustomTopics={setCustomTopics}
          onSetInterval={setAutoNewsInterval}
          onManualCheck={manualCheck}
          onClose={() => setShowAutoNewsPanel(false)}
        />
      )}
    </div>
  );
}
