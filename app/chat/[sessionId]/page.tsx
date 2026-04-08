"use client";

import { useState, type FormEvent, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useChat } from "@/hooks/useChat";
import ChatWindow from "@/components/chat/ChatWindow";
import TopicSelector from "@/components/chat/TopicSelector";

export default function ChatSessionPage() {
  const params = useParams();
  const router = useRouter();
  const { firebaseUser, loading: authLoading, signOut } = useAuth();
  const sessionId = params.sessionId as string;
  const { messages, isLoading, error, selectedTopic, sendMessage, setSelectedTopic } = useChat(sessionId);
  const [input, setInput] = useState("");

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

  return (
    <div className="flex h-screen flex-col bg-white">
      {/* 헤더 */}
      <header className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold text-gray-900">AI 뉴스 챗봇</h1>
        </div>
        <div className="flex items-center gap-2">
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
      <ChatWindow messages={messages} isLoading={isLoading} />

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
    </div>
  );
}
