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
import type { CustomPersona, PersonaId, PersonaOverride } from "@/types";

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
  overrideMap?: Record<string, PersonaOverride>;
}

const MENTION_QUERY_WAIT_MS = 200;

const ChatInput = forwardRef<ChatInputHandle, ChatInputProps>(function ChatInput(
  { onSubmit, disabled, maxLength, placeholder, customPersonaMap, overrideMap },
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
          const filtered = getFilteredPersonas(query, customPersonaMap, overrideMap);
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
    [customPersonaMap, overrideMap, showMention],
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

  /** 커서 위치에 "@" 를 삽입하고 멘션 드롭다운을 연다. 자문단 호출을 눈에 띄게 만드는 용도. */
  const insertAtMention = useCallback(() => {
    const el = textareaRef.current;
    const pos = el?.selectionStart ?? input.length;
    const prevChar = pos > 0 ? input[pos - 1] : "";
    const needsSpace = pos > 0 && prevChar !== " " && prevChar !== "\n";
    const insertion = `${needsSpace ? " " : ""}@`;
    const next = `${input.slice(0, pos)}${insertion}${input.slice(pos)}`;
    const filtered = getFilteredPersonas("", customPersonaMap, overrideMap);
    setInput(next);
    setMentionStart(pos + insertion.length - 1);
    setMentionQuery("");
    setMentionIndex(0);
    if (filtered.length > 0) setShowMention(true);
    setTimeout(() => {
      const target = textareaRef.current;
      if (!target) return;
      target.focus();
      const caret = pos + insertion.length;
      target.setSelectionRange(caret, caret);
    }, 0);
  }, [input, customPersonaMap, overrideMap]);

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
        const filtered = getFilteredPersonas(mentionQuery, customPersonaMap, overrideMap);
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
    [showMention, mentionQuery, mentionIndex, customPersonaMap, overrideMap, handleMentionSelect, handleSubmit],
  );

  return (
    <>
      {isOverLimit && (
        <div className="mx-auto mb-2 max-w-3xl text-center text-[13px] tracking-[-0.01em] text-[#D85A30]">
          메시지는 {maxLength}자 이내로 입력해주세요. (현재 {input.length}자)
        </div>
      )}
      <form
        onSubmit={handleSubmit}
        className="mx-auto flex max-w-3xl items-end gap-1.5 sm:gap-3"
      >
        <div className="relative flex-1">
          {showMention && (
            <MentionDropdown
              query={mentionQuery}
              onSelect={handleMentionSelect}
              onClose={() => setShowMention(false)}
              selectedIndex={mentionIndex}
              customPersonas={customPersonaMap}
              overrideMap={overrideMap}
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
            className={`w-full resize-none rounded-[22px] border bg-[#F0EDE6] pl-4 pr-3 py-3 text-[15px] leading-[1.47] tracking-[-0.022em] text-[#1E1B4B] placeholder:text-black/40 transition-colors focus:outline-none focus:bg-white sm:pl-[18px] sm:pr-14 ${
              isOverLimit
                ? "border-[#D85A30]/40 focus:border-[#D85A30]"
                : "border-transparent focus:border-[#1E1B4B]"
            }`}
          />
          {input.length > 0 && (
            <div
              className={`pointer-events-none absolute bottom-2 right-3 hidden sm:block text-[11px] tracking-[-0.01em] ${
                isOverLimit
                  ? "text-[#D85A30] font-semibold"
                  : input.length > maxLength * 0.8
                    ? "text-[#BC8E40]"
                    : "text-black/40"
              }`}
            >
              {input.length}/{maxLength}
            </div>
          )}
        </div>
        <button
          type="button"
          // textarea의 포커스를 빼앗지 않아야 blur로 인한 드롭다운 닫힘이 발생하지 않음
          onMouseDown={(e) => e.preventDefault()}
          onClick={insertAtMention}
          disabled={disabled}
          className="shrink-0 rounded-full bg-[#F0EDE6] w-10 h-10 text-[17px] font-semibold text-[#1E1B4B] transition-colors hover:bg-black/[0.06] disabled:opacity-50 sm:w-11 sm:h-11"
          aria-label="자문단 호출 (@)"
          title="자문단 호출"
        >
          @
        </button>
        <button
          type="submit"
          disabled={disabled || !input.trim() || isOverLimit}
          className="shrink-0 rounded-pill bg-[#1E1B4B] px-4 py-3 text-[14px] font-medium text-white transition-colors hover:bg-[#2A2766] active:bg-[#006adf] disabled:bg-black/20 disabled:cursor-not-allowed sm:px-7"
        >
          전송
        </button>
      </form>
    </>
  );
});

export default memo(ChatInput);
