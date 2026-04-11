"use client";

import { useState } from "react";
import type { GoalCategory } from "@/types";

interface GoalEditorModalProps {
  onSave: (params: {
    title: string;
    category: GoalCategory;
    description?: string;
    targetDate?: Date;
  }) => Promise<void>;
  onClose: () => void;
}

const CATEGORIES: { id: GoalCategory; label: string; icon: string }[] = [
  { id: "career", label: "커리어", icon: "💼" },
  { id: "health", label: "건강", icon: "💪" },
  { id: "learning", label: "학습", icon: "📚" },
  { id: "finance", label: "재무", icon: "💰" },
  { id: "relationship", label: "관계", icon: "🤝" },
  { id: "other", label: "기타", icon: "✨" },
];

export default function GoalEditorModal({ onSave, onClose }: GoalEditorModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<GoalCategory>("learning");
  const [targetDate, setTargetDate] = useState("");
  const [saving, setSaving] = useState(false);

  const canSave = title.trim().length > 0 && !saving;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      await onSave({
        title: title.trim(),
        category,
        description: description.trim() || undefined,
        targetDate: targetDate ? new Date(targetDate + "T23:59:59+09:00") : undefined,
      });
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
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-1 text-lg font-bold text-gray-900">새 목표 추가</h2>
        <p className="mb-4 text-xs text-gray-500">
          미래의 나와의 구체적인 약속을 하나 만들어보세요.
        </p>

        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">목표</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="예: 3개월 안에 영어 회화 중급 수준"
              maxLength={80}
              autoFocus
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">분야</label>
            <div className="grid grid-cols-3 gap-2">
              {CATEGORIES.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCategory(c.id)}
                  className={`rounded-lg border px-2 py-2 text-xs transition-colors ${
                    category === c.id
                      ? "border-amber-500 bg-amber-50 text-amber-800"
                      : "border-gray-200 text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  <span className="mr-1">{c.icon}</span>
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              마감일 (선택)
            </label>
            <input
              type="date"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              설명 (선택)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="왜 이 목표를 정했는지, 어떻게 측정할지 등"
              rows={3}
              maxLength={300}
              className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
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
            className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50"
          >
            {saving ? "저장 중..." : "목표 추가"}
          </button>
        </div>
      </div>
    </div>
  );
}
