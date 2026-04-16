"use client";

import {
  forwardRef,
  memo,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ChangeEvent,
} from "react";
import MentionDropdown, { getFilteredPersonas } from "@/components/chat/MentionDropdown";
import type { CustomPersona, PersonaId } from "@/types";

export interface ChatInputHandle {
  appendText: (text: string) => void;
  focus: () => void;
}

interface ChatInputProps {
  onSubmit: (text: string) => void | Promise<void>;
  disabled: boolean;
  maxLength: number;
  placeholder: string;
  customPersonaMap?: Record<string, CustomPersona>;
}

const MENTION_QUERY_WAIT_MS = 200;

const ChatInput = forwardRef<ChatInputHandle, ChatInputProps>(function ChatInput(
  { onSubmit, disabled, maxLength, placeholder, customPersonaMap },
  ref,
) {
  const [input, setInput] = useState("");
  const [showMention, setShowMention] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionIndex, setMentionIndex] = useState(0);
  const [mentionStart, setMentionStart] = useState(-1);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useImperativeHandle(ref, () => ({
    appendText: (text: string) => {
      setInput((prev) => (prev ? `${prev}\n${text}` : text));
      setTimeout(() => textareaRef.current?.focus(), 50);
    },
    focus: () => {
      textareaRef.current?.focus();
    },
  }));

  const isOverLimit = input.length > maxLength;

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value;
      setInput(value);

      // @가 전혀 없으면 멘션 탐색 스킵 — 대부분의 타이핑은 이 경로
      if (value.indexOf("@") === -1) {
        if (showMention) setShowMention(false);
        return;
      }

      const cursorPos = e.target.selectionStart;
      const textBeforeCursor = value.slice(0, cursorPos);
      const lastAtIndex = textBeforeCursor.lastIndexOf("@");

      if (lastAtIndex !== -1) {
        const charBeforeAt = lastAtIndex > 0 ? textBeforeCursor[lastAtIndex - 1] : " ";
        const query = textBeforeCursor.slice(lastAtIndex + 1);
        if (
          (charBeforeAt === " " || charBeforeAt === "\n" || lastAtIndex === 0) &&
          !query.includes(" ")
        ) {
          const filtered = getFilteredPersonas(query, customPersonaMap);
          if (filtered.length > 0) {
            setShowMention(true);
            setMentionQuery(query);
            setMentionStart(lastAtIndex);
            setMentionIndex(0);
            return;
          }
        }
      }
      if (showMention) setShowMention(false);
    },
    [customPersonaMap, showMention],
  );

  const handleMentionSelect = useCallback(
    (_personaId: PersonaId, personaName: string) => {
      setInput((current) => {
        const before = current.slice(0, mentionStart);
        const after = current.slice(mentionStart + 1 + mentionQuery.length);
        return `${before}@${personaName} ${after}`;
      });
      setShowMention(false);
      textareaRef.current?.focus();
    },
    [mentionStart, mentionQuery],
  );

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!input.trim() || isOverLimit || disabled) return;
      const text = input;
      setInput("");
      try {
        await onSubmit(text);
      } catch (err) {
        console.error("[ChatInput] onSubmit 실패:", err);
      }
    },
    [input, isOverLimit, disabled, onSubmit],
  );

  const handleKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
      if (showMention) {
        const filtered = getFilteredPersonas(mentionQuery, customPersonaMap);
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setMentionIndex((prev) => (prev + 1) % filtered.length);
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setMentionIndex((prev) => (prev - 1 + filtered.length) % filtered.length);
          return;
        }
        if (e.key === "Enter" || e.key === "Tab") {
          e.preventDefault();
          const selected = filtered[mentionIndex];
          if (selected) handleMentionSelect(selected.id, selected.name);
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          setShowMention(false);
          return;
        }
      }

      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit(e as unknown as FormEvent);
      }
    },
    [showMention, mentionQuery, mentionIndex, customPersonaMap, handleMentionSelect, handleSubmit],
  );

  return (
    <>
      {isOverLimit && (
        <div className="mx-auto mb-1.5 max-w-3xl text-center text-sm text-red-600">
          ⚠️ 메시지는 {maxLength}자 이내로 입력해주세요. (현재 {input.length}자)
        </div>
      )}
      <form
        onSubmit={handleSubmit}
        className="mx-auto flex max-w-3xl items-end gap-2 sm:gap-3"
      >
        <div className="relative flex-1">
          {showMention && (
            <MentionDropdown
              query={mentionQuery}
              onSelect={handleMentionSelect}
              onClose={() => setShowMention(false)}
              selectedIndex={mentionIndex}
              customPersonas={customPersonaMap}
            />
          )}
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onBlur={() => {
              // 드롭다운 항목 클릭 이벤트가 먼저 처리되도록 약간의 지연
              setTimeout(() => setShowMention(false), MENTION_QUERY_WAIT_MS);
            }}
            maxLength={maxLength + 50}
            placeholder={placeholder}
            rows={1}
            className={`w-full resize-none rounded-[22px] border bg-[#f2f2f7] pl-4 pr-14 py-2.5 text-[15px] leading-[1.45] text-gray-900 placeholder-gray-400 focus:outline-none focus:bg-white focus:ring-1 transition-colors ${
              isOverLimit
                ? "border-red-300 focus:border-red-400 focus:ring-red-400"
                : "border-transparent focus:border-[#007aff]/40 focus:ring-[#007aff]/30"
            }`}
          />
          <div
            className={`pointer-events-none absolute bottom-1.5 right-2 text-[10px] sm:text-xs ${
              isOverLimit
                ? "text-red-500 font-semibold"
                : input.length > maxLength * 0.8
                  ? "text-yellow-500"
                  : "text-gray-400"
            }`}
          >
            {input.length}/{maxLength}
          </div>
        </div>
        <button
          type="submit"
          disabled={disabled || !input.trim() || isOverLimit}
          className="shrink-0 rounded-full bg-[#007aff] px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90 active:opacity-80 disabled:opacity-40 transition-opacity sm:px-6"
        >
          전송
        </button>
      </form>
    </>
  );
});

export default memo(ChatInput);
