"use client";

import { useState } from "react";
import type { Goal } from "@/types";

interface GoalCheckinModalProps {
  goal: Goal;
  onSave: (progress: number, note?: string) => Promise<void>;
  onDelete: () => Promise<void>;
  onClose: () => void;
}

export default function GoalCheckinModal({ goal, onSave, onDelete, onClose }: GoalCheckinModalProps) {
  const [progress, setProgress] = useState(goal.progress ?? 0);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(progress, note.trim() || undefined);
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
        <div className="mb-4">
          <h2 className="text-lg font-bold text-gray-900">목표 체크인</h2>
          <p className="mt-1 text-sm text-gray-600">&ldquo;{goal.title}&rdquo;</p>
        </div>

        <div className="mb-4">
          <label className="mb-2 block text-sm font-medium text-gray-700">
            진척률 <span className="text-amber-600">{progress}%</span>
          </label>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={progress}
            onChange={(e) => setProgress(parseInt(e.target.value, 10))}
            className="w-full accent-amber-500"
          />
          <div className="mt-1 flex justify-between text-xs text-gray-400">
            <span>0%</span>
            <span>50%</span>
            <span>100%</span>
          </div>
        </div>

        <div className="mb-6">
          <label className="mb-2 block text-sm font-medium text-gray-700">
            오늘 진행한 것 (선택)
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="예: 영단어 30개 외웠어. 발음 연습은 아직 어려움."
            rows={3}
            maxLength={200}
            className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
          />
          <div className="mt-1 text-right text-xs text-gray-400">{note.length}/200</div>
        </div>

        {confirmDelete ? (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3">
            <p className="text-sm text-red-700">정말로 이 목표를 삭제할까요?</p>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={async () => {
                  setSaving(true);
                  try {
                    await onDelete();
                  } finally {
                    setSaving(false);
                  }
                }}
                disabled={saving}
                className="rounded-md bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                삭제
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="rounded-md border border-gray-300 px-3 py-1 text-xs text-gray-700 hover:bg-gray-50"
              >
                취소
              </button>
            </div>
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="text-xs text-gray-500 hover:text-red-600"
          >
            목표 삭제
          </button>
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
              disabled={saving}
              className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50"
            >
              {saving ? "저장 중..." : "체크인 저장"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
