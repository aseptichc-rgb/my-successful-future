"use client";

import { useState, type FormEvent, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useChat } from "@/hooks/useChat";
import ChatWindow from "@/components/chat/ChatWindow";
import TopicSelector from "@/components/chat/TopicSelector";
import PersonaSelector from "@/components/chat/PersonaSelector";
import ParticipantsBadge from "@/components/chat/ParticipantsBadge";
import InviteModal from "@/components/chat/InviteModal";
import InvitationBell from "@/components/chat/InvitationBell";

export default function ChatSessionPage() {
  const params = useParams();
  const router = useRouter();
  const { user, firebaseUser, loading: authLoading, signOut } = useAuth();
  const sessionId = params.sessionId as string;

  const currentUid = firebaseUser?.uid;
  const currentName = user?.displayName || firebaseUser?.displayName || "사용자";

  const {
    messages, isLoading, error, selectedTopic,
    activePersonas, respondingPersona, session,
    sendMessage, setSelectedTopic, togglePersona,
  } = useChat(sessionId, currentUid, currentName);

  const [input, setInput] = useState("");
  const [showInviteModal, setShowInviteModal] = useState(false);

  useEffect(() => {
    if (!authLoading && !firebaseUser) {
      router.push("/login");
    }
  }, [authLoading, firebaseUser, router]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    const message = input;
    setInput("");
    await sendMessage(message);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
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
    <div className="flex h-screen flex-col bg-white">
      {/* 헤더 */}
      <header className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold text-gray-900">AI 뉴스 챗봇</h1>
          <PersonaSelector activePersonas={activePersonas} onToggle={togglePersona} />
          {session?.participantNames && currentUid && (
            <ParticipantsBadge
              participantNames={session.participantNames}
              ownerUid={session.uid}
              currentUid={currentUid}
            />
          )}
        </div>
        <div className="flex items-center gap-2">
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

      {/* 도메인 필터 */}
      <TopicSelector selected={selectedTopic} onChange={setSelectedTopic} />

      {/* 채팅 영역 */}
      <ChatWindow messages={messages} isLoading={isLoading} respondingPersona={respondingPersona} />

      {/* 에러 메시지 */}
      {error && (
        <div className="px-4 py-2 text-center text-sm text-red-600">
          {error}
        </div>
      )}

      {/* 입력 영역 */}
      <div className="border-t border-gray-200 px-4 py-3">
        <form
          onSubmit={handleSubmit}
          className="mx-auto flex max-w-3xl items-end gap-3"
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="궁금한 뉴스를 물어보세요..."
            rows={1}
            className="flex-1 resize-none rounded-xl border border-gray-300 px-4 py-3 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
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
    </div>
  );
}
