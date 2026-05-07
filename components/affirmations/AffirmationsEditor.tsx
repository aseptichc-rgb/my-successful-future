"use client";

import { useState } from "react";
import {
  MAX_SUCCESS_AFFIRMATIONS,
  SUCCESS_AFFIRMATION_MAX_LEN,
} from "@/lib/firebase";
import { useT } from "@/lib/i18n";

/**
 * "성공한 나의 모습" 다짐 편집기. 설정 페이지와 온보딩에서 공유.
 *
 * - value/onChange 로 부모가 상태를 관리 (저장 시점 분리).
 * - 행 추가는 최대 MAX_SUCCESS_AFFIRMATIONS 까지, 빈 줄도 일단 허용 (저장 시 normalize 가 떨어냄).
 */
export default function AffirmationsEditor({
  value,
  onChange,
  disabled = false,
  className = "",
}: {
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  className?: string;
}) {
  const t = useT();
  const [newDraft, setNewDraft] = useState("");

  const addRow = () => {
    const text = newDraft.trim().slice(0, SUCCESS_AFFIRMATION_MAX_LEN);
    if (!text) return;
    if (value.length >= MAX_SUCCESS_AFFIRMATIONS) return;
    onChange([...value, text]);
    setNewDraft("");
  };

  const updateRow = (idx: number, next: string) => {
    onChange(value.map((v, i) => (i === idx ? next.slice(0, SUCCESS_AFFIRMATION_MAX_LEN) : v)));
  };

  const removeRow = (idx: number) => {
    onChange(value.filter((_, i) => i !== idx));
  };

  const moveRow = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= value.length) return;
    const next = value.slice();
    [next[idx], next[target]] = [next[target], next[idx]];
    onChange(next);
  };

  return (
    <div className={className}>
      {value.length === 0 ? (
        <p className="rounded-[10px] border border-dashed border-black/15 bg-[#F7F4ED] px-3 py-3 text-center text-[12px] text-black/50">
          {t("affirmations.editor.placeholder")}
        </p>
      ) : (
        <ul className="space-y-2">
          {value.map((text, idx) => (
            <li key={idx} className="flex items-center gap-2">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#1E1B4B]/10 text-[12px] font-semibold text-[#1E1B4B]">
                {idx + 1}
              </span>
              <input
                value={text}
                disabled={disabled}
                maxLength={SUCCESS_AFFIRMATION_MAX_LEN}
                onChange={(e) => updateRow(idx, e.target.value)}
                placeholder={t("affirmations.editor.placeholder")}
                className="min-w-0 flex-1 rounded-[10px] border border-black/10 bg-white px-3 py-2 text-[14px] tracking-[-0.01em] text-[#1E1B4B] placeholder:text-black/40 focus:border-[#1E1B4B] focus:outline-none disabled:opacity-60"
              />
              <div className="flex shrink-0 items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => moveRow(idx, -1)}
                  disabled={disabled || idx === 0}
                  aria-label="위로 이동"
                  className="flex h-7 w-7 items-center justify-center rounded-full text-black/40 transition-colors hover:bg-black/[0.04] hover:text-black/80 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M6 15l6-6 6 6" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => moveRow(idx, 1)}
                  disabled={disabled || idx === value.length - 1}
                  aria-label="아래로 이동"
                  className="flex h-7 w-7 items-center justify-center rounded-full text-black/40 transition-colors hover:bg-black/[0.04] hover:text-black/80 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => removeRow(idx)}
                  disabled={disabled}
                  aria-label={t("affirmations.editor.removeAria")}
                  className="flex h-7 w-7 items-center justify-center rounded-full text-black/40 transition-colors hover:bg-black/[0.04] hover:text-black/80 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {value.length < MAX_SUCCESS_AFFIRMATIONS && (
        <div className="mt-3 flex items-center gap-2">
          <input
            value={newDraft}
            disabled={disabled}
            maxLength={SUCCESS_AFFIRMATION_MAX_LEN}
            onChange={(e) => setNewDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addRow();
              }
            }}
            placeholder={t("affirmations.editor.placeholder")}
            className="min-w-0 flex-1 rounded-[10px] border border-black/10 bg-white px-3 py-2 text-[14px] tracking-[-0.01em] text-[#1E1B4B] placeholder:text-black/40 focus:border-[#1E1B4B] focus:outline-none disabled:opacity-60"
          />
          <button
            type="button"
            onClick={addRow}
            disabled={disabled || !newDraft.trim()}
            className="shrink-0 rounded-pill bg-[#1E1B4B] px-4 py-2 text-[12px] font-medium text-white transition-colors hover:bg-[#2A2766] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t("common.add")}
          </button>
        </div>
      )}

      <p className="mt-2 text-right text-[11px] tracking-[-0.01em] text-black/40">
        {value.length}/{MAX_SUCCESS_AFFIRMATIONS} · {t("affirmations.editor.maxNote", { max: MAX_SUCCESS_AFFIRMATIONS, len: SUCCESS_AFFIRMATION_MAX_LEN })}
      </p>
    </div>
  );
}
