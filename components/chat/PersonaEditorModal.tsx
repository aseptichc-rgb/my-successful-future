"use client";

import { useState } from "react";
import type { BuiltinPersonaId, PersonaOverride, PersonaOverrideInput } from "@/types";
import { PERSONAS } from "@/lib/personas";
import { mergePersona } from "@/lib/persona-resolver";
import {
  MAX_PERSONA_NAME_LEN,
  MAX_PERSONA_DESC_LEN,
  MAX_PERSONA_SYSTEM_PROMPT_LEN,
} from "@/lib/constants/persona";

interface PersonaEditorModalProps {
  personaId: BuiltinPersonaId;
  override: PersonaOverride | null | undefined;
  onSave: (data: PersonaOverrideInput) => Promise<void>;
  onReset: () => Promise<void>;
  onClose: () => void;
}

const ICON_CHOICES = [
  "📰", "💼", "🏥", "📊", "🖥️", "🏛️", "🌟",
  "✨", "🎯", "💡", "🧭", "🔮", "👨‍🏫", "👩‍⚕️", "🧙", "🎭", "🦉", "⚔️",
];

export default function PersonaEditorModal({
  personaId,
  override,
  onSave,
  onReset,
  onClose,
}: PersonaEditorModalProps) {
  const base = PERSONAS[personaId];
  const merged = mergePersona(base, override ?? null);

  const [name, setName] = useState(merged.name);
  const [icon, setIcon] = useState(merged.icon);
  const [description, setDescription] = useState(merged.description);
  const [systemPromptAddition, setSystemPromptAddition] = useState(
    merged.systemPromptAddition.trim()
  );
  const [saving, setSaving] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const hasOverride = !!override;
  const canSave = !saving && name.trim().length >= 1;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        icon: icon.trim(),
        description: description.trim(),
        systemPromptAddition: systemPromptAddition.trim(),
      });
      onClose();
    } catch (err) {
      console.error("페르소나 오버라이드 저장 실패:", err);
      alert("저장에 실패했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    setSaving(true);
    try {
      await onReset();
      onClose();
    } catch (err) {
      console.error("페르소나 오버라이드 리셋 실패:", err);
      alert("기본값 복원에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-1 text-lg font-bold text-gray-900">
          자문단 역할 편집 — {base.name}
        </h2>
        <p className="mb-5 text-xs text-gray-500">
          이름·아이콘·설명·시스템 프롬프트를 본인만의 스타일로 바꿀 수 있어요. 변경은 본인 계정에만 적용됩니다.
        </p>

        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">이름</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={MAX_PERSONA_NAME_LEN}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">아이콘</label>
            <div className="flex flex-wrap gap-1.5">
              {ICON_CHOICES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setIcon(c)}
                  className={`h-9 w-9 rounded-lg border text-xl transition-colors ${
                    icon === c
                      ? "border-violet-500 bg-violet-50"
                      : "border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">한 줄 설명</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={MAX_PERSONA_DESC_LEN}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
            />
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="block text-sm font-medium text-gray-700">시스템 프롬프트 (역할·말투·전문성)</label>
              <span className="text-[11px] text-gray-400">
                {systemPromptAddition.length}/{MAX_PERSONA_SYSTEM_PROMPT_LEN}
              </span>
            </div>
            <textarea
              value={systemPromptAddition}
              onChange={(e) => setSystemPromptAddition(e.target.value)}
              rows={10}
              maxLength={MAX_PERSONA_SYSTEM_PROMPT_LEN}
              className="w-full resize-y rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
            />
            <p className="mt-1 text-[11px] text-gray-400">
              비워두면 기본 프롬프트가 사용됩니다.
            </p>
          </div>
        </div>

        {confirmReset && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p className="text-sm text-amber-800">수정 내용을 지우고 기본값으로 되돌릴까요?</p>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={handleReset}
                disabled={saving}
                className="rounded-md bg-amber-600 px-3 py-1 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50"
              >
                기본값으로
              </button>
              <button
                type="button"
                onClick={() => setConfirmReset(false)}
                className="rounded-md border border-gray-300 px-3 py-1 text-xs text-gray-700 hover:bg-gray-50"
              >
                취소
              </button>
            </div>
          </div>
        )}

        <div className="mt-5 flex items-center justify-between gap-2">
          {hasOverride && !confirmReset ? (
            <button
              type="button"
              onClick={() => setConfirmReset(true)}
              className="text-xs text-gray-400 hover:text-amber-700"
            >
              기본값으로 되돌리기
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              취소
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!canSave}
              className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50"
            >
              {saving ? "저장 중..." : "저장"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
