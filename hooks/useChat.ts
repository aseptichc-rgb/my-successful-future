"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Timestamp } from "firebase/firestore";
import { getMessages, addMessage, updateSessionTitle } from "@/lib/firebase";
import { getPersona } from "@/lib/personas";
import type { ChatMessage, ChatStreamEvent, NewsTopic, PersonaId } from "@/types";

export function useChat(sessionId: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedTopic, setSelectedTopic] = useState<NewsTopic>("전체");
  const [activePersonas, setActivePersonas] = useState<PersonaId[]>(["default"]);
  const [respondingPersona, setRespondingPersona] = useState<PersonaId | null>(null);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

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

  // 페르소나 추가/제거
  const togglePersona = useCallback((personaId: PersonaId) => {
    setActivePersonas((prev) => {
      if (prev.includes(personaId)) {
        // 최소 1개는 유지
        if (prev.length <= 1) return prev;
        return prev.filter((id) => id !== personaId);
      }
      return [...prev, personaId];
    });
  }, []);

  // 단일 페르소나에 대한 스트리밍 호출
  const streamPersonaResponse = useCallback(
    async (
      content: string,
      personaId: PersonaId,
      accumulatedHistory: { role: "user" | "assistant"; content: string }[],
      assistantId: string
    ): Promise<string> => {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: content,
          history: accumulatedHistory,
          topic: selectedTopic,
          persona: personaId,
          participants: activePersonas.length > 1 ? activePersonas : undefined,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No reader available");

      const decoder = new TextDecoder();
      let buffer = "";
      let fullText = "";

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

            if (data.type === "sources" && data.sources) {
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === assistantId
                    ? { ...msg, sources: data.sources! }
                    : msg
                )
              );
            }

            if (data.type === "done" && data.content) {
              fullText = data.content;
            }

            if (data.type === "error") {
              setError(data.error || "오류가 발생했습니다.");
            }
          } catch {
            // JSON 파싱 실패 무시
          }
        }
      }

      return fullText;
    },
    [selectedTopic, activePersonas]
  );

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim() || isLoading) return;

      setError(null);
      setIsLoading(true);

      // 사용자 메시지를 즉시 UI에 추가
      const userMessage: ChatMessage = {
        id: `temp-user-${Date.now()}`,
        sessionId,
        role: "user",
        content,
        sources: [],
        createdAt: Timestamp.now(),
      };
      setMessages((prev) => [...prev, userMessage]);

      // 사용자 메시지 Firestore 저장
      addMessage(sessionId, "user", content).catch((err) =>
        console.error("Failed to save user message:", err)
      );

      // 첫 메시지인 경우 세션 제목 자동 생성
      if (messagesRef.current.length === 0) {
        const title = content.length > 50 ? content.slice(0, 50) + "..." : content;
        updateSessionTitle(sessionId, title).catch((err) =>
          console.error("Failed to update session title:", err)
        );
      }

      // 기존 대화 히스토리 구성 (다중 페르소나 태그 포함)
      const isMulti = activePersonas.length > 1;
      let accumulatedHistory = messagesRef.current.map((msg) => ({
        role: msg.role as "user" | "assistant",
        content:
          msg.role === "assistant" && isMulti && msg.personaName
            ? `[${msg.personaName}] ${msg.content}`
            : msg.content,
      }));

      try {
        // 각 활성 페르소나가 순차적으로 응답
        for (const personaId of activePersonas) {
          const persona = getPersona(personaId);

          // 어시스턴트 메시지 플레이스홀더
          const assistantId = `temp-${personaId}-${Date.now()}`;
          const assistantMessage: ChatMessage = {
            id: assistantId,
            sessionId,
            role: "assistant",
            content: "",
            sources: [],
            createdAt: Timestamp.now(),
            personaId,
            personaName: persona.name,
            personaIcon: persona.icon,
          };
          setMessages((prev) => [...prev, assistantMessage]);
          setRespondingPersona(personaId);

          try {
            const fullText = await streamPersonaResponse(
              content,
              personaId,
              accumulatedHistory,
              assistantId
            );

            // Firestore 저장 (페르소나 정보 포함)
            if (fullText) {
              addMessage(sessionId, "assistant", fullText, [], {
                personaId,
                personaName: persona.name,
                personaIcon: persona.icon,
              }).catch((err) =>
                console.error("Failed to save assistant message:", err)
              );

              // 다음 페르소나를 위해 히스토리에 추가
              accumulatedHistory.push({
                role: "assistant",
                content: isMulti ? `[${persona.name}] ${fullText}` : fullText,
              });
            }
          } catch {
            // 이 페르소나 실패 시 해당 메시지 제거, 다음 페르소나는 계속 진행
            setMessages((prev) => prev.filter((msg) => msg.id !== assistantId));
          }
        }
      } catch {
        setError("메시지 전송에 실패했습니다. 다시 시도해주세요.");
      } finally {
        setIsLoading(false);
        setRespondingPersona(null);
      }
    },
    [sessionId, selectedTopic, activePersonas, isLoading, streamPersonaResponse]
  );

  return {
    messages,
    isLoading,
    error,
    selectedTopic,
    activePersonas,
    respondingPersona,
    sendMessage,
    setSelectedTopic,
    togglePersona,
    loadHistory,
  };
}
