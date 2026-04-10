"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Timestamp } from "firebase/firestore";
import { getMessages, addMessage, updateSessionTitle, onMessagesSnapshot, getSessionById, incrementUnreadCounts, updateUserMemory } from "@/lib/firebase";
import { getPersona, PERSONAS } from "@/lib/personas";
import type { ChatMessage, ChatSession, ChatStreamEvent, NewsSource, NewsTopic, PersonaId, SessionType } from "@/types";

/** 응답 텍스트에서 AI가 붙인 [이름] 접두사를 제거 */
function stripPersonaPrefix(text: string): string {
  return text.replace(/^\[.*?\]\s*/, "");
}

/**
 * AI 응답에서 본문 중간에 끼어든 [이름] 마커를 단락 구분(\n\n)으로 변환.
 * AI가 단락 구분 없이 한 덩어리로 응답하면서 중간에 자기 이름을 반복해 붙이는 케이스 처리.
 * 또한 모델이 가끔 출력하는 단독 백슬래시(특히 줄 시작의 \\n 흔적)를 제거한다.
 */
function normalizePersonaMarkers(text: string): string {
  return text
    // 1) 본문 중간 [이름] 마커 → 단락 구분
    .replace(/(?!^)\s*\[[^\]\n]{1,30}\]\s*/g, "\n\n")
    // 2) 줄 시작에 있는 백슬래시 시퀀스 제거 (모델이 \\n\\n을 그대로 따라 쓰는 케이스)
    .replace(/^\s*\\+\s*$/gm, "")
    // 3) 본문 안의 \n / \\n 같은 이스케이프 텍스트를 실제 줄바꿈으로 치환
    .replace(/\\+n/g, "\n")
    // 4) 남아 있는 단독 백슬래시 제거
    .replace(/\\+/g, "");
}

/** 사람 타이핑보다 약간 빠른 속도로 한 글자씩 노출 (ms/char). */
const TYPING_DELAY_MS = 30;
/** 문단 사이에서 잠깐 멈춰 "다음 메시지 보내는 듯한" 느낌을 주는 시간(ms). */
const PARAGRAPH_PAUSE_MS = 700;
/** 서버 청크를 기다리는 동안 폴링 간격(ms). */
const STREAM_POLL_MS = 20;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

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

export function useChat(
  sessionId: string,
  currentUid?: string,
  currentName?: string,
  userPersona?: string,
  futurePersona?: string,
  userMemory?: string,
  onMemoryUpdated?: (memory: string) => void,
  initialPersona?: PersonaId,
) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedTopic, setSelectedTopic] = useState<NewsTopic>("전체");
  const [activePersonas, setActivePersonas] = useState<PersonaId[]>(
    initialPersona ? [initialPersona] : ["default"],
  );
  const [respondingPersona, setRespondingPersona] = useState<PersonaId | null>(null);
  const conversationPersonaRef = useRef<PersonaId | null>(null);
  const [session, setSession] = useState<ChatSession | null>(null);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const isLoadingRef = useRef(isLoading);
  isLoadingRef.current = isLoading;
  // 메모리 업데이트 동시 실행 방지
  const memoryUpdateInFlightRef = useRef(false);
  // 사용자 메시지 카운트 (메모리 업데이트 트리거 판정용)
  const userMessageCountRef = useRef(0);

  // 세션 정보 로드 + future-self 세션이면 activePersonas 자동 설정
  useEffect(() => {
    if (sessionId) {
      getSessionById(sessionId).then((s) => {
        setSession(s);
        if (s?.sessionType === "future-self") {
          setActivePersonas(["future-self"]);
        }
      });
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

  // 백그라운드에서 사용자 메모리 업데이트 (5번째 사용자 메시지마다 트리거)
  const triggerMemoryUpdateIfNeeded = useCallback(async () => {
    if (!currentUid) return;
    if (memoryUpdateInFlightRef.current) return;

    userMessageCountRef.current += 1;
    // 5개의 사용자 메시지마다 메모리 업데이트
    if (userMessageCountRef.current % 5 !== 0) return;

    memoryUpdateInFlightRef.current = true;
    try {
      // 최근 사용자 메시지 10개 추출 (현재 messages state에서)
      const recentUserMessages = messagesRef.current
        .filter((m) => m.role === "user" && m.senderUid === currentUid)
        .slice(-10)
        .map((m) => m.content);

      if (recentUserMessages.length === 0) return;

      const res = await fetch("/api/user-memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          existingMemory: userMemory || "",
          recentUserMessages,
          userPersona: userPersona || undefined,
        }),
      });

      if (!res.ok) return;
      const data = await res.json();
      const newMemory: string = data.memory || "";

      if (newMemory && newMemory !== userMemory) {
        await updateUserMemory(currentUid, newMemory, messagesRef.current.length);
        onMemoryUpdated?.(newMemory);
      }
    } catch (err) {
      console.warn("Memory update failed:", err);
    } finally {
      memoryUpdateInFlightRef.current = false;
    }
  }, [currentUid, userMemory, userPersona, onMemoryUpdated]);

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
          futurePersona: futurePersona || undefined,
          userMemory: userMemory || undefined,
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
      let receivedRaw = ""; // 서버에서 받은 누적 텍스트(아직 렌더되지 않을 수 있음)
      let collectedSources: NewsSource[] = [];
      let serverDone = false;
      let readerError: Error | null = null;
      const bubbleIds: string[] = [assistantId];
      const persona = getPersona(personaId);

      // 1) 백그라운드에서 서버 SSE를 최대한 빠르게 누적만 한다.
      const readerTask = (async () => {
        try {
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
                  receivedRaw += data.content;
                } else if (data.type === "sources" && data.sources) {
                  collectedSources = data.sources;
                } else if (data.type === "done" && data.content) {
                  fullText = stripPersonaPrefix(data.content);
                } else if (data.type === "error") {
                  setError(data.error || "오류가 발생했습니다.");
                }
              } catch {
                // JSON 파싱 실패 무시
              }
            }
          }
        } catch (e) {
          readerError = e instanceof Error ? e : new Error(String(e));
        } finally {
          serverDone = true;
        }
      })();

      // 2) 사람 타이핑보다 약간 빠른 속도로 한 글자씩 노출하는 렌더 루프.
      //    문단 경계(\n\n)를 막 지난 직후에는 더 길게 쉬어 "한 문단씩 끊어 보내는" 느낌을 만든다.
      let displayedLength = 0;
      while (true) {
        if (displayedLength >= receivedRaw.length) {
          if (serverDone) break;
          await sleep(STREAM_POLL_MS);
          continue;
        }

        displayedLength += 1;

        const visible = receivedRaw.slice(0, displayedLength);
        const paragraphs = normalizePersonaMarkers(visible)
          .split("\n\n")
          .map((p) => stripPersonaPrefix(p.trim()))
          .filter((p) => p.length > 0);

        // 새 문단이 생기면 새 버블 생성
        let createdNewBubble = false;
        while (bubbleIds.length < paragraphs.length) {
          const newId = `temp-${personaId}-${Date.now()}-${bubbleIds.length}`;
          bubbleIds.push(newId);
          createdNewBubble = true;
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

        // 문단을 새로 만들었다면(=방금 \n\n 경계를 넘었다면) 잠시 멈춤
        await sleep(createdNewBubble ? PARAGRAPH_PAUSE_MS : TYPING_DELAY_MS);
      }

      // 3) reader가 완전히 끝날 때까지 대기 (sources 이벤트 보장)
      await readerTask;
      if (readerError) throw readerError;

      // 소스는 마지막 버블에만 첨부
      if (collectedSources.length > 0) {
        const lastBubbleId = bubbleIds[bubbleIds.length - 1];
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === lastBubbleId
              ? { ...msg, sources: collectedSources }
              : msg
          )
        );
      }

      if (!fullText) fullText = stripPersonaPrefix(receivedRaw);

      return { fullText, sources: collectedSources, bubbleIds };
    },
    [selectedTopic, activePersonas, userPersona, futurePersona, userMemory, sessionId]
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
              const paragraphs = normalizePersonaMarkers(fullText)
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
        // 백그라운드에서 사용자 메모리 업데이트 (await 안 함 → UI 블로킹 X)
        triggerMemoryUpdateIfNeeded();
      }
    },
    [sessionId, selectedTopic, activePersonas, isLoading, streamPersonaResponse, currentUid, currentName, triggerMemoryUpdateIfNeeded, session]
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
