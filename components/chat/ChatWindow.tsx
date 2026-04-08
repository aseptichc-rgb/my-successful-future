"use client";

import { useEffect, useRef } from "react";
import type { ChatMessage } from "@/types";
import MessageBubble from "@/components/chat/MessageBubble";
import LoadingDots from "@/components/ui/LoadingDots";

interface Props {
  messages: ChatMessage[];
  isLoading: boolean;
}

export default function ChatWindow({ messages, isLoading }: Props) {
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

        {isLoading && (
          <div className="flex justify-start">
            <div className="rounded-2xl bg-gray-100">
              <LoadingDots />
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
