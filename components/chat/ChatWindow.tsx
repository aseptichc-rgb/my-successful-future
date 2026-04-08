"use client";

import { useEffect, useRef } from "react";
import type { ChatMessage, PersonaId } from "@/types";
import { getPersona } from "@/lib/personas";
import MessageBubble from "@/components/chat/MessageBubble";
import LoadingDots from "@/components/ui/LoadingDots";

interface Props {
  messages: ChatMessage[];
  isLoading: boolean;
  respondingPersona?: PersonaId | null;
}

export default function ChatWindow({ messages, isLoading, respondingPersona }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  return (
    <div className="flex-1 overflow-y-auto px-4 py-6">
      {messages.length === 0 && !isLoading && (
        <div className="flex h-full items-center justify-center">
          <div className="text-center text-gray-400">
            <p className="text-lg font-medium">AI 뉴스 어시스턴트</p>
            <p className="mt-1 text-sm">궁금한 뉴스를 물어보세요</p>
          </div>
        </div>
      )}

      <div className="mx-auto max-w-3xl space-y-4">
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}

        {isLoading && respondingPersona && (
          <div className="flex justify-start">
            <div className="rounded-2xl bg-gray-100 px-4 py-3">
              <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-gray-500">
                <span>{getPersona(respondingPersona).icon}</span>
                <span>{getPersona(respondingPersona).name} 응답 중...</span>
              </div>
              <LoadingDots />
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
