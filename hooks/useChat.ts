"use client";

import { useState, useCallback, useEffect } from "react";
import { Timestamp } from "firebase/firestore";
import { getMessages, addMessage } from "@/lib/firebase";
import type { ChatMessage, ChatStreamEvent, NewsTopic } from "@/types";

export function useChat(sessionId: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedTopic, setSelectedTopic] = useState<NewsTopic>("전체");

  // Firestore에서 기존 메시지 로드
  const loadHistory = useCallback(async () => {
    try {
      const history = await getMessages(sessionId);
      setMessages(history);
    } catch (err) {
      console.error("Failed to load messages:", err);
    }
  }, [sessionId]);

  useEffect(() => {
    if (sessionId) {
      loadHistory();
    }
  }, [sessionId, loadHistory]);

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim() || isLoading) return;

      setError(null);
      setIsLoading(true);

      // 사용자 메시지를 즉시 UI에 추가 (낙관적 업데이트)
      const userMessage: ChatMessage = {
        id: `temp-user-${Date.now()}`,
        sessionId,
        role: "user",
        content,
        sources: [],
        createdAt: Timestamp.now(),
      };
      setMessages((prev) => [...prev, userMessage]);

      // 어시스턴트 메시지 플레이스홀더
      const assistantId = `temp-assistant-${Date.now()}`;
      const assistantMessage: ChatMessage = {
        id: assistantId,
        sessionId,
        role: "assistant",
        content: "",
        sources: [],
        createdAt: Timestamp.now(),
      };
      setMessages((prev) => [...prev, assistantMessage]);

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: content,
            sessionId,
            topic: selectedTopic,
          }),
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error("No reader available");

        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;

            try {
              const data: ChatStreamEvent = JSON.parse(line.slice(6));

              if (data.type === "text" && data.content) {
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === assistantId
                      ? { ...msg, content: msg.content + data.content }
                      : msg
                  )
                );
              }

              if (data.type === "error") {
                setError(data.error || "오류가 발생했습니다.");
              }
            } catch {
              // JSON 파싱 실패 무시
            }
          }
        }
      } catch (err) {
        setError("메시지 전송에 실패했습니다. 다시 시도해주세요.");
        // 실패한 어시스턴트 메시지 제거
        setMessages((prev) => prev.filter((msg) => msg.id !== assistantId));
      } finally {
        setIsLoading(false);
      }
    },
    [sessionId, selectedTopic, isLoading]
  );

  return {
    messages,
    isLoading,
    error,
    selectedTopic,
    sendMessage,
    setSelectedTopic,
    loadHistory,
  };
}
