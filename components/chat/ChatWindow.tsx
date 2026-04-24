"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import type { ChatMessage, CustomPersona, PersonaId } from "@/types";
import { getPersona } from "@/lib/personas";
import MessageBubble from "@/components/chat/MessageBubble";
import LoadingDots from "@/components/ui/LoadingDots";

interface Props {
  messages: ChatMessage[];
  isLoading: boolean;
  respondingPersona?: PersonaId | null;
  customPersonaMap?: Record<string, CustomPersona>;
  /** 빈 대화방에 보여줄 헤드라인. 미지정이면 "AI 뉴스 어시스턴트" 기본값. */
  emptyTitle?: string;
  emptySubtitle?: string;
}

// KST 기준 오늘 00:00의 epoch(ms)
function kstTodayStartMs(): number {
  const now = new Date();
  const kstMs = now.getTime() + 9 * 60 * 60 * 1000;
  const kst = new Date(kstMs);
  kst.setUTCHours(0, 0, 0, 0);
  return kst.getTime() - 9 * 60 * 60 * 1000;
}

function ChatWindow({ messages, isLoading, respondingPersona, customPersonaMap, emptyTitle, emptySubtitle }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [showOld, setShowOld] = useState(false);

  const { oldMessages, todayMessages } = useMemo(() => {
    const threshold = kstTodayStartMs();
    const older: ChatMessage[] = [];
    const today: ChatMessage[] = [];
    for (const m of messages) {
      const ms = m.createdAt?.toMillis?.() ?? 0;
      if (ms && ms < threshold) older.push(m);
      else today.push(m);
    }
    return { oldMessages: older, todayMessages: today };
  }, [messages]);

  // 오늘 메시지가 하나도 없고 과거 메시지만 존재하면 기본적으로 펼쳐서 보여준다.
  // (빈 화면을 마주하는 혼란 방지)
  const effectiveShowOld = showOld || todayMessages.length === 0;

  const visibleMessages = effectiveShowOld ? messages : todayMessages;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [visibleMessages.length, isLoading]);

  const hasOld = oldMessages.length > 0;

  return (
    <div className="flex-1 overflow-y-auto bg-white px-3 py-5 sm:px-6 sm:py-6">
      {messages.length === 0 && !isLoading && (
        <div className="flex h-full items-center justify-center">
          <div className="text-center">
            <p className="text-[28px] font-semibold leading-[1.14] tracking-[-0.005em] text-[#1d1d1f]">
              {emptyTitle || "AI 뉴스 어시스턴트"}
            </p>
            <p className="mt-2 text-[15px] tracking-[-0.022em] text-black/56">
              {emptySubtitle || "궁금한 뉴스를 물어보세요."}
            </p>
          </div>
        </div>
      )}

      <div className="mx-auto max-w-3xl">
        {hasOld && todayMessages.length > 0 && (
          <div className="mb-4 flex justify-center">
            <button
              type="button"
              onClick={() => setShowOld((v) => !v)}
              className="rounded-pill border border-black/[0.08] bg-white px-3.5 py-1 text-[11px] font-medium tracking-[-0.01em] text-black/70 transition-colors hover:bg-black/[0.03]"
            >
              {effectiveShowOld
                ? "이전 대화 접기"
                : `이전 대화 ${oldMessages.length}개 보기`}
            </button>
          </div>
        )}

        {effectiveShowOld && hasOld && todayMessages.length > 0 && (
          <div className="my-4 flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.08em] text-black/40">
            <div className="h-px flex-1 bg-black/[0.08]" />
            <span>오늘</span>
            <div className="h-px flex-1 bg-black/[0.08]" />
          </div>
        )}

        {visibleMessages.map((msg, i) => {
          if (msg.role === "assistant" && !msg.content) return null;

          const prevMsg = i > 0 ? visibleMessages[i - 1] : null;
          const isContinuation =
            msg.role === "assistant" &&
            prevMsg?.role === "assistant" &&
            prevMsg?.personaId === msg.personaId &&
            !!prevMsg?.content;

          return (
            <div key={msg.id} className={isContinuation ? "mt-1" : "mt-4 first:mt-0"}>
              <MessageBubble
                message={msg}
                showPersonaHeader={!isContinuation}
              />
            </div>
          );
        })}

        {isLoading && respondingPersona && (() => {
          const p = getPersona(respondingPersona, customPersonaMap);
          return (
            <div className="mt-4 flex justify-start">
              <div className="rounded-[22px] bg-[#f5f5f7] px-4 py-3">
                <div className="mb-1.5 flex items-center gap-1.5 text-[12px] font-semibold tracking-[-0.01em] text-black/56">
                  <span>{p.icon}</span>
                  <span>{p.name} 응답 중…</span>
                </div>
                <LoadingDots />
              </div>
            </div>
          );
        })()}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}

export default memo(ChatWindow);
