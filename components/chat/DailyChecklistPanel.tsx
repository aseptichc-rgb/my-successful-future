"use client";

import { useState } from "react";
import type { DailyTask } from "@/types";

interface DailyChecklistPanelProps {
  tasksWithTodayState: { task: DailyTask; doneToday: boolean }[];
  progress: { done: number; total: number; percent: number };
  onAdd: (title: string, icon?: string) => Promise<void>;
  onToggle: (task: DailyTask) => Promise<void>;
  onRemove: (taskId: string) => Promise<void>;
}

export default function DailyChecklistPanel({
  tasksWithTodayState,
  progress,
  onAdd,
  onToggle,
  onRemove,
}: DailyChecklistPanelProps) {
  const [expanded, setExpanded] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [saving, setSaving] = useState(false);

  const handleAdd = async () => {
    const title = newTitle.trim();
    if (!title) return;
    setSaving(true);
    try {
      await onAdd(title);
      setNewTitle("");
      setShowAdd(false);
    } finally {
      setSaving(false);
    }
  };

  const allDone = progress.total > 0 && progress.done === progress.total;

  return (
    <div className="border-b border-emerald-200 bg-gradient-to-r from-emerald-50 to-teal-50">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-2.5 text-left hover:bg-emerald-100/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-base">{allDone ? "🎉" : "📋"}</span>
          <span className="text-sm font-semibold text-emerald-900">
            오늘 체크리스트 {progress.total > 0 ? `(${progress.done}/${progress.total})` : ""}
          </span>
          {progress.total === 0 && (
            <span className="text-xs text-emerald-700">— 매일 반복할 습관을 추가해보세요</span>
          )}
          {allDone && (
            <span className="rounded-full bg-emerald-200 px-2 py-0.5 text-[10px] font-medium text-emerald-800">
              전부 완료!
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span
            onClick={(e) => {
              e.stopPropagation();
              setShowAdd(true);
              setExpanded(true);
            }}
            className="rounded-md border border-emerald-300 bg-white px-2 py-0.5 text-xs text-emerald-800 hover:bg-emerald-100"
            role="button"
          >
            + 추가
          </span>
          <svg
            className={`h-4 w-4 text-emerald-700 transition-transform ${expanded ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {expanded && (
        <div className="space-y-1 px-4 pb-3">
          {progress.total > 0 && (
            <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-emerald-100">
              <div
                className="h-full bg-gradient-to-r from-emerald-400 to-teal-500 transition-all"
                style={{ width: `${progress.percent}%` }}
              />
            </div>
          )}

          {tasksWithTodayState.map(({ task, doneToday }) => (
            <div
              key={task.id}
              className="group flex items-center gap-3 rounded-lg border border-emerald-200 bg-white/80 px-3 py-2 hover:bg-white transition-colors"
            >
              <button
                type="button"
                onClick={() => onToggle(task)}
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-colors ${
                  doneToday
                    ? "border-emerald-500 bg-emerald-500 text-white"
                    : "border-gray-300 bg-white hover:border-emerald-400"
                }`}
                aria-label={doneToday ? "완료 해제" : "완료 표시"}
              >
                {doneToday && (
                  <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
              <div className="flex-1 min-w-0">
                <div className={`text-sm ${doneToday ? "text-gray-400 line-through" : "text-gray-900"}`}>
                  {task.title}
                </div>
                {task.streakCount > 0 && (
                  <div className="mt-0.5 text-[11px] text-orange-600">
                    🔥 {task.streakCount}일째 연속
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => onRemove(task.id)}
                className="shrink-0 rounded p-1 text-gray-300 opacity-0 hover:bg-red-50 hover:text-red-500 group-hover:opacity-100 transition-opacity"
                aria-label="삭제"
              >
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}

          {showAdd && (
            <div className="flex items-center gap-2 rounded-lg border border-dashed border-emerald-300 bg-white p-2">
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAdd();
                  if (e.key === "Escape") {
                    setShowAdd(false);
                    setNewTitle("");
                  }
                }}
                placeholder="예: 아침 30분 운동 · 영어 단어 20개"
                maxLength={60}
                autoFocus
                disabled={saving}
                className="flex-1 border-0 bg-transparent px-1 py-1 text-sm text-gray-900 placeholder-gray-400 focus:outline-none"
              />
              <button
                type="button"
                onClick={handleAdd}
                disabled={saving || !newTitle.trim()}
                className="rounded-md bg-emerald-500 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
              >
                추가
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowAdd(false);
                  setNewTitle("");
                }}
                className="rounded-md px-2 py-1 text-xs text-gray-500 hover:bg-gray-100"
              >
                취소
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
