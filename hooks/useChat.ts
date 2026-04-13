"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Timestamp } from "firebase/firestore";
import { getMessages, addMessage, updateSessionTitle, onMessagesSnapshot, getSessionById, incrementUnreadCounts, updateUserMemory, onPersonaMemoriesSnapshot, updatePersonaMemory } from "@/lib/firebase";
import { getPersona, PERSONAS, isCustomPersonaId } from "@/lib/personas";
import { detectBotCommand } from "@/lib/externalBots";
import type { ChatMessage, ChatSession, ChatStreamEvent, CustomPersona, DailyTaskSnapshot, GoalSnapshot, MoodKind, NewsSource, NewsTopic, PersonaId, SessionType } from "@/types";

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
  activeGoals?: GoalSnapshot[],
  dailyTasks?: DailyTaskSnapshot[],
  customPersonaMap?: Record<string, CustomPersona>,
) {
  const activeGoalsRef = useRef<GoalSnapshot[] | undefined>(activeGoals);
  activeGoalsRef.current = activeGoals;
  const dailyTasksRef = useRef<DailyTaskSnapshot[] | undefined>(dailyTasks);
  dailyTasksRef.current = dailyTasks;
  const customPersonaMapRef = useRef<Record<string, CustomPersona> | undefined>(customPersonaMap);
  customPersonaMapRef.current = customPersonaMap;
  // 페르소나별 기억 샤드 (Firestore subscribe)
  const [personaMemories, setPersonaMemories] = useState<Record<string, string>>({});
  const personaMemoriesRef = useRef<Record<string, string>>({});
  personaMemoriesRef.current = personaMemories;
  // 페르소나별 턴 카운터 (업데이트 트리거용)
  const personaTurnCountRef = useRef<Record<string, number>>({});
  const personaMemoryInFlightRef = useRef<Set<string>>(new Set());
  // 감정 상태 (mood-aware future-self)
  const [mood, setMood] = useState<MoodKind>("unknown");
  const moodRef = useRef<MoodKind>("unknown");
  moodRef.current = mood;
  const moodInFlightRef = useRef(false);
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

  // 페르소나별 기억 샤드 실시간 구독
  useEffect(() => {
    if (!currentUid) return;
    const unsub = onPersonaMemoriesSnapshot(currentUid, (map) => {
      const plain: Record<string, string> = {};
      Object.entries(map).forEach(([id, mem]) => {
        if (mem.summary) plain[id] = mem.summary;
      });
      setPersonaMemories(plain);
    });
    return unsub;
  }, [currentUid]);

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

  // 백그라운드에서 감정 상태 업데이트 (3번째 사용자 메시지마다 트리거)
  const userMessageCountForMoodRef = useRef(0);
  const triggerMoodUpdate = useCallback(async () => {
    if (moodInFlightRef.current) return;
    userMessageCountForMoodRef.current += 1;
    // 3메시지마다 갱신
    if (userMessageCountForMoodRef.current % 3 !== 0) return;

    moodInFlightRef.current = true;
    try {
      const recent = messagesRef.current
        .filter((m) => m.role === "user" && m.senderUid === currentUid)
        .slice(-5)
        .map((m) => m.content);
      if (recent.length === 0) return;

      const res = await fetch("/api/mood", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recentUserMessages: recent }),
      });
      if (!res.ok) return;
      const data = await res.json();
      const next: MoodKind = data.mood || "unknown";
      if (next && next !== moodRef.current) setMood(next);
    } catch (err) {
      console.warn("Mood update failed:", err);
    } finally {
      moodInFlightRef.current = false;
    }
  }, [currentUid]);

  // 백그라운드에서 페르소나별 기억 업데이트 (해당 페르소나 5턴마다)
  const triggerPersonaMemoryUpdate = useCallback(
    async (personaId: PersonaId) => {
      if (!currentUid) return;
      if (personaId === "default" || personaId === "future-self") return; // 뉴스봇/미래의 나는 제외
      if (personaMemoryInFlightRef.current.has(personaId)) return;

      const prev = personaTurnCountRef.current[personaId] || 0;
      const next = prev + 1;
      personaTurnCountRef.current[personaId] = next;
      if (next % 5 !== 0) return;

      personaMemoryInFlightRef.current.add(personaId);
      try {
        // 해당 페르소나와의 최근 대화 추출 (사용자 ↔ 이 페르소나)
        const recentExchanges: { role: "user" | "assistant"; content: string }[] = [];
        for (const msg of messagesRef.current.slice(-40)) {
          if (msg.role === "user") {
            recentExchanges.push({ role: "user", content: msg.content });
          } else if (msg.role === "assistant" && msg.personaId === personaId) {
            recentExchanges.push({ role: "assistant", content: msg.content });
          }
        }
        if (recentExchanges.length === 0) return;

        const persona = getPersona(personaId, customPersonaMapRef.current);
        const existing = personaMemoriesRef.current[personaId] || "";
        const res = await fetch("/api/persona-memory", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            personaId,
            personaName: persona.name,
            existingMemory: existing,
            recentExchanges: recentExchanges.slice(-20),
          }),
        });
        if (!res.ok) return;
        const data = await res.json();
        const newMemory: string = data.memory || "";
        if (newMemory && newMemory !== existing) {
          await updatePersonaMemory(currentUid, personaId, newMemory, messagesRef.current.length);
        }
      } catch (err) {
        console.warn(`Persona memory update failed (${personaId}):`, err);
      } finally {
        personaMemoryInFlightRef.current.delete(personaId);
      }
    },
    [currentUid]
  );

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
      const personaMemory = personaMemoriesRef.current?.[personaId];
      const isCustom = isCustomPersonaId(personaId as string);
      const customPayload = isCustom
        ? customPersonaMapRef.current?.[personaId as string]
        : undefined;
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: content,
          sessionId,
          history: accumulatedHistory,
          topic: selectedTopic,
          persona: personaId,
          participants: activePersonas.length > 1 ? activePersonas : undefined,
          userPersona: userPersona || undefined,
          futurePersona: futurePersona || undefined,
          userMemory: userMemory || undefined,
          activeGoals: activeGoalsRef.current && activeGoalsRef.current.length > 0 ? activeGoalsRef.current : undefined,
          dailyTasks: dailyTasksRef.current && dailyTasksRef.current.length > 0 ? dailyTasksRef.current : undefined,
          personaMemory: personaMemory && personaMemory.trim().length > 0 ? personaMemory : undefined,
          customPersona: customPayload
            ? {
                id: customPayload.id,
                name: customPayload.name,
                icon: customPayload.icon,
                description: customPayload.description,
                systemPromptAddition: customPayload.systemPromptAddition,
              }
            : undefined,
          mood: moodRef.current !== "unknown" ? moodRef.current : undefined,
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
      let readerError: Error | null = null;
      const bubbleIds: string[] = [assistantId];
      const persona = getPersona(personaId, customPersonaMapRef.current);

      // 서버 SSE 청크를 받을 때마다 즉시 버블에 반영한다.
      // 인위적 타이핑 애니메이션 없이 청크 단위로만 setMessages → 리렌더 횟수 최소화.
      const applyVisibleText = () => {
        const paragraphs = normalizePersonaMarkers(receivedRaw)
          .split("\n\n")
          .map((p) => stripPersonaPrefix(p.trim()))
          .filter((p) => p.length > 0);

        if (paragraphs.length === 0) return;

        // 새 문단이 생기면 새 버블을 한 번에 추가
        const newBubbles: ChatMessage[] = [];
        while (bubbleIds.length + newBubbles.length < paragraphs.length) {
          const idx = bubbleIds.length + newBubbles.length;
          const newId = `temp-${personaId}-${Date.now()}-${idx}`;
          newBubbles.push({
            id: newId,
            sessionId,
            role: "assistant" as const,
            content: paragraphs[idx] ?? "",
            sources: [],
            createdAt: Timestamp.now(),
            personaId,
            personaName: persona.name,
            personaIcon: persona.icon,
          });
        }
        if (newBubbles.length > 0) {
          bubbleIds.push(...newBubbles.map((b) => b.id));
        }

        setMessages((prev) => {
          const bubbleIdSet = new Set(bubbleIds);
          const next = prev.map((msg) => {
            if (!bubbleIdSet.has(msg.id)) return msg;
            const idx = bubbleIds.indexOf(msg.id);
            const nextContent = paragraphs[idx];
            if (nextContent === undefined || nextContent === msg.content) return msg;
            return { ...msg, content: nextContent };
          });
          return newBubbles.length > 0 ? [...next, ...newBubbles] : next;
        });
      };

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n\n");
          buffer = lines.pop() || "";

          let textChanged = false;
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            try {
              const data: ChatStreamEvent = JSON.parse(line.slice(6));

              if (data.type === "text" && data.content) {
                receivedRaw += data.content;
                textChanged = true;
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
          if (textChanged) applyVisibleText();
        }
      } catch (e) {
        readerError = e instanceof Error ? e : new Error(String(e));
      }

      // 마지막 한 번 더 반영(마지막 청크 이후 파싱 보정)
      applyVisibleText();
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

      // 외부 봇 슬래시 명령어 감지 (예: "/gpt 안녕")
      const botCommand = detectBotCommand(content);
      if (botCommand) {
        const { bot, message: botMessage } = botCommand;
        const assistantId = `temp-${bot.id}-${Date.now()}`;
        const assistantMessage: ChatMessage = {
          id: assistantId,
          sessionId,
          role: "assistant",
          content: "",
          sources: [],
          createdAt: Timestamp.now(),
          personaId: bot.id,
          personaName: bot.name,
          personaIcon: bot.icon,
        };
        setMessages((prev) => [...prev, assistantMessage]);
        setRespondingPersona(bot.id);

        try {
          const botHistory = messagesRef.current.map((msg) => ({
            role: msg.role as "user" | "assistant",
            content: msg.content,
          }));

          const response = await fetch("/api/external-bot", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              botId: bot.id,
              message: botMessage,
              history: botHistory,
            }),
          });

          if (!response.ok) {
            const errBody = await response.json().catch(() => null);
            throw new Error(errBody?.error || `HTTP ${response.status}`);
          }

          const reader = response.body?.getReader();
          if (!reader) throw new Error("No reader");
          const decoder = new TextDecoder();
          let buffer = "";
          let fullText = "";
          let streamErr: string | null = null;

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
                  fullText += data.content;
                  setMessages((prev) =>
                    prev.map((msg) =>
                      msg.id === assistantId ? { ...msg, content: fullText } : msg
                    )
                  );
                } else if (data.type === "done" && data.content) {
                  fullText = data.content;
                } else if (data.type === "error") {
                  streamErr = data.error || "외부 봇 호출 실패";
                }
              } catch {
                // 무시
              }
            }
          }

          if (streamErr) throw new Error(streamErr);

          if (fullText) {
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantId ? { ...msg, content: fullText } : msg
              )
            );
            addMessage(sessionId, "assistant", fullText, [], {
              personaId: bot.id,
              personaName: bot.name,
              personaIcon: bot.icon,
            }).catch((err) =>
              console.error("Failed to save external bot message:", err)
            );
          }
        } catch (err) {
          setMessages((prev) => prev.filter((msg) => msg.id !== assistantId));
          setError(err instanceof Error ? err.message : "외부 봇 호출 실패");
        } finally {
          setIsLoading(false);
          setRespondingPersona(null);
        }
        return;
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
          const persona = getPersona(personaId, customPersonaMapRef.current);

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
              // 페르소나별 메모리 업데이트 트리거 (fire-and-forget)
              triggerPersonaMemoryUpdate(personaId);
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
        // 백그라운드에서 사용자 메모리 + 감정 업데이트 (await 안 함 → UI 블로킹 X)
        triggerMemoryUpdateIfNeeded();
        triggerMoodUpdate();
      }
    },
    [sessionId, selectedTopic, activePersonas, isLoading, streamPersonaResponse, currentUid, currentName, triggerMemoryUpdateIfNeeded, triggerPersonaMemoryUpdate, triggerMoodUpdate, session]
  );

  // AI 대화 맥락 종료 (DM/그룹에서 AI 응답을 멈추고 싶을 때)
  const dismissAI = useCallback(() => {
    conversationPersonaRef.current = null;
  }, []);

  // 🪑 카운슬 모드: 선택된 페르소나들이 순차적으로 의견을 내고, 마지막에 미래의 나가 종합
  const sendCouncilQuestion = useCallback(
    async (question: string, personaIds: PersonaId[]) => {
      if (!question.trim() || isLoading) return;
      if (personaIds.length === 0) return;

      // 미래의 나는 항상 마지막 종합자로 자동 포함
      const rounds: PersonaId[] = personaIds.filter((p) => p !== "future-self");
      rounds.push("future-self");

      const councilGroupId = `council-${Date.now()}`;
      setError(null);
      setIsLoading(true);

      // 사용자 질문 메시지 저장 (카운슬 그룹에 묶음)
      const userMsgId = `temp-user-${Date.now()}`;
      const userMessage: ChatMessage = {
        id: userMsgId,
        sessionId,
        role: "user",
        content: question,
        sources: [],
        createdAt: Timestamp.now(),
        senderUid: currentUid,
        senderName: currentName,
        councilGroupId,
        councilRound: 0,
        councilQuestion: question,
      };
      setMessages((prev) => [...prev, userMessage]);

      addMessage(
        sessionId,
        "user",
        question,
        [],
        undefined,
        currentUid,
        currentName,
        { councilGroupId, councilRound: 0, councilQuestion: question }
      ).catch((err) => console.error("Failed to save council question:", err));

      // 프라이어 라운드 컨텍스트 누적
      const priorRounds: { personaName: string; content: string }[] = [];

      try {
        for (let i = 0; i < rounds.length; i++) {
          const personaId = rounds[i];
          const persona = getPersona(personaId, customPersonaMapRef.current);
          const isFinal = personaId === "future-self" && i === rounds.length - 1;
          const round = i + 1;
          setRespondingPersona(personaId);

          const assistantId = `temp-council-${personaId}-${Date.now()}`;
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
            councilGroupId,
            councilRound: isFinal ? 999 : round,
          };
          setMessages((prev) => [...prev, assistantMessage]);

          try {
            const personaMemoryForThis = personaMemoriesRef.current?.[personaId];
            const isCustomP = isCustomPersonaId(personaId as string);
            const customPayloadP = isCustomP
              ? customPersonaMapRef.current?.[personaId as string]
              : undefined;
            const response = await fetch("/api/chat", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                message: question,
                sessionId,
                history: [],
                topic: "전체",
                persona: personaId,
                userPersona: userPersona || undefined,
                futurePersona: futurePersona || undefined,
                userMemory: userMemory || undefined,
                activeGoals: activeGoalsRef.current && activeGoalsRef.current.length > 0 ? activeGoalsRef.current : undefined,
                dailyTasks: dailyTasksRef.current && dailyTasksRef.current.length > 0 ? dailyTasksRef.current : undefined,
                personaMemory: personaMemoryForThis && personaMemoryForThis.trim().length > 0 ? personaMemoryForThis : undefined,
                councilContext: priorRounds.length > 0 ? priorRounds : undefined,
                isCouncilFinal: isFinal,
                customPersona: customPayloadP
                  ? {
                      id: customPayloadP.id,
                      name: customPayloadP.name,
                      icon: customPayloadP.icon,
                      description: customPayloadP.description,
                      systemPromptAddition: customPayloadP.systemPromptAddition,
                    }
                  : undefined,
                mood: moodRef.current !== "unknown" ? moodRef.current : undefined,
              }),
            });

            if (!response.ok) {
              throw new Error(`HTTP ${response.status}`);
            }

            // SSE를 모두 모아서 한 번에 표시 (카운슬은 길이가 짧아 스트리밍 불필요)
            const reader = response.body?.getReader();
            if (!reader) throw new Error("No reader");
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
                    fullText += data.content;
                    const clean = stripPersonaPrefix(normalizePersonaMarkers(fullText).trim());
                    setMessages((prev) =>
                      prev.map((m) => (m.id === assistantId ? { ...m, content: clean } : m))
                    );
                  } else if (data.type === "done" && data.content) {
                    fullText = data.content;
                  }
                } catch {
                  // ignore
                }
              }
            }

            const cleaned = stripPersonaPrefix(normalizePersonaMarkers(fullText).trim());
            // Firestore 저장 (단일 메시지)
            if (cleaned) {
              addMessage(
                sessionId,
                "assistant",
                cleaned,
                [],
                { personaId, personaName: persona.name, personaIcon: persona.icon },
                undefined,
                undefined,
                { councilGroupId, councilRound: isFinal ? 999 : round }
              ).catch((err) => console.error("Failed to save council response:", err));

              priorRounds.push({ personaName: persona.name, content: cleaned });
            }
          } catch (err) {
            console.warn(`Council round ${round} 실패:`, err);
            setMessages((prev) => prev.filter((m) => m.id !== assistantId));
          }
        }
      } catch {
        setError("카운슬 진행에 실패했습니다. 다시 시도해주세요.");
      } finally {
        setIsLoading(false);
        setRespondingPersona(null);
      }
    },
    [isLoading, sessionId, currentUid, currentName, userPersona, futurePersona, userMemory]
  );

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
    mood,
    sendMessage,
    sendCouncilQuestion,
    personaMemories,
    setSelectedTopic,
    togglePersona,
    dismissAI,
  };
}
