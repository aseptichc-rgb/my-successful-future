"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Timestamp } from "firebase/firestore";
import { getMessages, addMessage, updateSessionTitle, onMessagesSnapshot, getSessionById, incrementUnreadCounts } from "@/lib/firebase";
import { getPersona, PERSONAS } from "@/lib/personas";
import type { ChatMessage, ChatSession, ChatStreamEvent, NewsSource, NewsTopic, PersonaId, SessionType } from "@/types";

/** 응답 텍스트에서 AI가 붙인 [이름] 접두사를 제거 */
function stripPersonaPrefix(text: string): string {
  return text.replace(/^\[.*?\]\s*/, "");
}

/** 메시지에서 @멘션된 페르소나 ID를 추출 */
function parseMentions(content: string): PersonaId[] {
  const mentioned: PersonaId[] = [];
  for (const persona of Object.values(PERSONAS)) {
    // @페르소나이름 패턴 매칭 (이름 뒤에 공백이나 문장 끝)
    const pattern = new RegExp(`@${persona.name}(?:\\s|$)`, "g");
    if (pattern.test(content)) {
      mentioned.push(persona.id);
    }
  }
  return mentioned;
}

export function useChat(sessionId: string, currentUid?: string, currentName?: string, userPersona?: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedTopic, setSelectedTopic] = useState<NewsTopic>("전체");
  const [activePersonas, setActivePersonas] = useState<PersonaId[]>(["default"]);
  const [respondingPersona, setRespondingPersona] = useState<PersonaId | null>(null);
  const conversationPersonaRef = useRef<PersonaId | null>(null);
  const [session, setSession] = useState<ChatSession | null>(null);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const isLoadingRef = useRef(isLoading);
  isLoadingRef.current = isLoading;

  // 세션 정보 로드
  useEffect(() => {
    if (sessionId) {
      getSessionById(sessionId).then(setSession);
    }
  }, [sessionId]);

  // 실시간 메시지 리스너 (다른 참여자의 메시지를 즉시 수신)
  useEffect(() => {
    if (!sessionId) return;

    const unsub = onMessagesSnapshot(sessionId, (serverMessages) => {
      // 로딩 중(스트리밍 중)이면 서버 동기화 건너뜀 (스트리밍과 충돌 방지)
      if (isLoadingRef.current) return;
      setMessages(serverMessages);
    });

    return unsub;
  }, [sessionId]);

  // 페르소나 추가/제거
  const togglePersona = useCallback((personaId: PersonaId) => {
    setActivePersonas((prev) => {
      if (prev.includes(personaId)) {
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
    ): Promise<{ fullText: string; sources: NewsSource[]; bubbleIds: string[] }> => {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: content,
          history: accumulatedHistory,
          topic: selectedTopic,
          persona: personaId,
          participants: activePersonas.length > 1 ? activePersonas : undefined,
          userPersona: userPersona || undefined,
        }),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => null);
        throw new Error(errorBody?.error || `HTTP ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No reader available");

      const decoder = new TextDecoder();
      let buffer = "";
      let fullText = "";
      let fullAccumulated = "";
      let collectedSources: NewsSource[] = [];
      const bubbleIds: string[] = [assistantId];
      const persona = getPersona(personaId);

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
              fullAccumulated += data.content;

              // \n\n 단위로 문단 분리 → 각 문단을 별도 채팅 버블로 표시
              const paragraphs = fullAccumulated
                .split("\n\n")
                .map((p) => stripPersonaPrefix(p.trim()))
                .filter((p) => p.length > 0);

              // 새 문단이 생기면 새 버블 생성
              while (bubbleIds.length < paragraphs.length) {
                const newId = `temp-${personaId}-${Date.now()}-${bubbleIds.length}`;
                bubbleIds.push(newId);
                setMessages((prev) => [
                  ...prev,
                  {
                    id: newId,
                    sessionId,
                    role: "assistant" as const,
                    content: "",
                    sources: [],
                    createdAt: Timestamp.now(),
                    personaId,
                    personaName: persona.name,
                    personaIcon: persona.icon,
                  },
                ]);
              }

              // 각 버블에 해당 문단 내용 업데이트
              setMessages((prev) =>
                prev.map((msg) => {
                  const idx = bubbleIds.indexOf(msg.id);
                  if (idx >= 0 && paragraphs[idx] !== undefined) {
                    return { ...msg, content: paragraphs[idx] };
                  }
                  return msg;
                })
              );
            }

            if (data.type === "sources" && data.sources) {
              collectedSources = data.sources;
              // 소스는 마지막 버블에만 첨부
              const lastBubbleId = bubbleIds[bubbleIds.length - 1];
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === lastBubbleId
                    ? { ...msg, sources: data.sources! }
                    : msg
                )
              );
            }

            if (data.type === "done" && data.content) {
              fullText = stripPersonaPrefix(data.content);
            }

            if (data.type === "error") {
              setError(data.error || "오류가 발생했습니다.");
            }
          } catch {
            // JSON 파싱 실패 무시
          }
        }
      }

      return { fullText, sources: collectedSources, bubbleIds };
    },
    [selectedTopic, activePersonas, userPersona]
  );

  // 세션 타입 헬퍼
  const sessionType: SessionType = session?.sessionType || "ai";
  const isDirectChat = sessionType === "dm" || sessionType === "group";

  const MAX_INPUT_LENGTH = 500;

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim() || isLoading) return;

      // 입력 글자수 제한 검증
      if (content.length > MAX_INPUT_LENGTH) {
        setError(`메시지는 ${MAX_INPUT_LENGTH}자 이내로 입력해주세요. (현재 ${content.length}자)`);
        return;
      }

      setError(null);
      setIsLoading(true);

      // 사용자 메시지를 즉시 UI에 추가 (발신자 정보 포함)
      const userMessage: ChatMessage = {
        id: `temp-user-${Date.now()}`,
        sessionId,
        role: "user",
        content,
        sources: [],
        createdAt: Timestamp.now(),
        senderUid: currentUid,
        senderName: currentName,
      };
      setMessages((prev) => [...prev, userMessage]);

      // 사용자 메시지 Firestore 저장 (발신자 정보 포함)
      addMessage(sessionId, "user", content, [], undefined, currentUid, currentName).catch((err) =>
        console.error("Failed to save user message:", err)
      );

      // 안읽은 메시지 카운트 증가
      if (session?.participants && currentUid) {
        incrementUnreadCounts(sessionId, currentUid, session.participants).catch((err) =>
          console.error("Failed to increment unread counts:", err)
        );
      }

      // 첫 메시지인 경우 세션 제목 자동 생성
      if (messagesRef.current.length === 0) {
        const title = content.length > 50 ? content.slice(0, 50) + "..." : content;
        updateSessionTitle(sessionId, title).catch((err) =>
          console.error("Failed to update session title:", err)
        );
      }

      // @멘션 파싱 (모든 세션 타입에서 공통)
      const mentionedPersonas = parseMentions(content);
      const currentSessionType: SessionType = session?.sessionType || "ai";

      // DM/그룹 채팅: @멘션도 없고 진행 중인 AI 대화도 없으면 메시지만 저장
      if ((currentSessionType === "dm" || currentSessionType === "group") && mentionedPersonas.length === 0 && !conversationPersonaRef.current) {
        // 푸시 알림 트리거
        if (currentUid) {
          fetch("/api/notify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sessionId,
              senderUid: currentUid,
              senderName: currentName,
              messagePreview: content.slice(0, 100),
            }),
          }).catch(() => {});
        }
        setIsLoading(false);
        return;
      }

      // 대화 히스토리 구성
      const isMulti = activePersonas.length > 1;
      const accumulatedHistory = messagesRef.current.map((msg) => ({
        role: msg.role as "user" | "assistant",
        content:
          msg.role === "assistant" && msg.personaName
            ? `[${msg.personaName}] ${msg.content}`
            : msg.role === "user" && msg.senderName
              ? `[${msg.senderName}] ${msg.content}`
              : msg.content,
      }));

      // 응답할 페르소나 결정
      let respondPersonas: PersonaId[];

      if (mentionedPersonas.length > 0) {
        // @멘션된 페르소나가 있으면 해당 페르소나만 응답
        respondPersonas = mentionedPersonas;
        conversationPersonaRef.current = mentionedPersonas.length === 1 ? mentionedPersonas[0] : null;
      } else if (conversationPersonaRef.current) {
        respondPersonas = [conversationPersonaRef.current];
      } else {
        // 뉴스봇은 @멘션 없이는 자동 응답하지 않음
        const nonDefault = activePersonas.filter((id) => id !== "default");
        respondPersonas = nonDefault.length > 0 ? nonDefault : activePersonas;
      }

      try {
        for (const personaId of respondPersonas) {
          const persona = getPersona(personaId);

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
            const { fullText, sources, bubbleIds } = await streamPersonaResponse(
              content,
              personaId,
              accumulatedHistory,
              assistantId
            );

            if (fullText) {
              // 문단별로 분리하여 Firestore에 개별 저장
              const paragraphs = fullText
                .split("\n\n")
                .map((p) => stripPersonaPrefix(p.trim()))
                .filter((p) => p.length > 0);

              for (let i = 0; i < paragraphs.length; i++) {
                const isLast = i === paragraphs.length - 1;
                addMessage(
                  sessionId,
                  "assistant",
                  paragraphs[i],
                  isLast ? sources : [],
                  {
                    personaId,
                    personaName: persona.name,
                    personaIcon: persona.icon,
                  }
                ).catch((err) =>
                  console.error("Failed to save assistant message:", err)
                );
              }

              accumulatedHistory.push({
                role: "assistant",
                content: isMulti ? `[${persona.name}] ${fullText}` : fullText,
              });
            }
          } catch {
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
    [sessionId, selectedTopic, activePersonas, isLoading, streamPersonaResponse, currentUid, currentName]
  );

  // AI 대화 맥락 종료 (DM/그룹에서 AI 응답을 멈추고 싶을 때)
  const dismissAI = useCallback(() => {
    conversationPersonaRef.current = null;
  }, []);

  return {
    messages,
    isLoading,
    error,
    selectedTopic,
    activePersonas,
    respondingPersona,
    respondingConversationPersona: conversationPersonaRef.current,
    session,
    sessionType,
    isDirectChat,
    sendMessage,
    setSelectedTopic,
    togglePersona,
    dismissAI,
  };
}
