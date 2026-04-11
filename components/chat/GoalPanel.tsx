"use client";

import { useState } from "react";
import type { Goal, GoalCategory } from "@/types";
import GoalCheckinModal from "./GoalCheckinModal";
import GoalEditorModal from "./GoalEditorModal";

const CATEGORY_LABEL: Record<GoalCategory, string> = {
  career: "커리어",
  health: "건강",
  learning: "학습",
  finance: "재무",
  relationship: "관계",
  other: "기타",
};

const CATEGORY_COLOR: Record<GoalCategory, string> = {
  career: "bg-blue-100 text-blue-700",
  health: "bg-emerald-100 text-emerald-700",
  learning: "bg-purple-100 text-purple-700",
  finance: "bg-amber-100 text-amber-700",
  relationship: "bg-pink-100 text-pink-700",
  other: "bg-gray-100 text-gray-700",
};

interface GoalPanelProps {
  goals: Goal[];
  onAdd: (params: {
    title: string;
    category: GoalCategory;
    description?: string;
    targetDate?: Date;
  }) => Promise<void>;
  onCheckin: (goalId: string, progress: number, note?: string) => Promise<void>;
  onRemove: (goalId: string) => Promise<void>;
}

function formatDaysLeft(goal: Goal): string | null {
  if (!goal.targetDate) return null;
  const target = new Date(goal.targetDate.toMillis());
  target.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((target.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
  if (diff > 0) return `D-${diff}`;
  if (diff === 0) return "오늘 마감";
  return `${Math.abs(diff)}일 지남`;
}

function formatLastCheckin(goal: Goal): string | null {
  if (!goal.lastCheckinAt) return null;
  const ms = goal.lastCheckinAt.toMillis();
  const diff = Date.now() - ms;
  const days = Math.floor(diff / (24 * 60 * 60 * 1000));
  if (days === 0) return "오늘 체크인";
  if (days === 1) return "어제 체크인";
  if (days < 7) return `${days}일 전 체크인`;
  if (days < 30) return `${Math.floor(days / 7)}주 전 체크인`;
  return `${Math.floor(days / 30)}개월 전 체크인`;
}

export default function GoalPanel({ goals, onAdd, onCheckin, onRemove }: GoalPanelProps) {
  const [expanded, setExpanded] = useState(true);
  const [checkinGoal, setCheckinGoal] = useState<Goal | null>(null);
  const [showEditor, setShowEditor] = useState(false);

  return (
    <div className="border-b border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-2.5 text-left hover:bg-amber-100/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-base">🎯</span>
          <span className="text-sm font-semibold text-amber-900">
            나의 목표 ({goals.length})
          </span>
          {goals.length === 0 && (
            <span className="text-xs text-amber-700">
              — 미래의 나와의 약속을 하나 정해보세요
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span
            onClick={(e) => {
              e.stopPropagation();
              setShowEditor(true);
            }}
            className="rounded-md border border-amber-300 bg-white px-2 py-0.5 text-xs text-amber-800 hover:bg-amber-100"
            role="button"
          >
            + 추가
          </span>
          <svg
            className={`h-4 w-4 text-amber-700 transition-transform ${expanded ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {expanded && goals.length > 0 && (
        <div className="space-y-1.5 px-4 pb-3">
          {goals.map((goal) => {
            const daysLeft = formatDaysLeft(goal);
            const lastCheckin = formatLastCheckin(goal);
            return (
              <button
                key={goal.id}
                type="button"
                onClick={() => setCheckinGoal(goal)}
                className="flex w-full items-center gap-3 rounded-lg border border-amber-200 bg-white/80 p-2.5 text-left hover:bg-white transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${CATEGORY_COLOR[goal.category]}`}
                    >
                      {CATEGORY_LABEL[goal.category]}
                    </span>
                    <span className="truncate text-sm font-medium text-gray-900">
                      {goal.title}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-amber-100">
                      <div
                        className="h-full bg-gradient-to-r from-amber-400 to-orange-500 transition-all"
                        style={{ width: `${goal.progress}%` }}
                      />
                    </div>
                    <span className="shrink-0 text-xs font-medium text-amber-700">
                      {goal.progress}%
                    </span>
                  </div>
                  {(daysLeft || lastCheckin) && (
                    <div className="mt-0.5 flex items-center gap-2 text-[11px] text-gray-500">
                      {daysLeft && <span>{daysLeft}</span>}
                      {daysLeft && lastCheckin && <span>·</span>}
                      {lastCheckin && <span>{lastCheckin}</span>}
                    </div>
                  )}
                </div>
                <svg className="h-4 w-4 shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            );
          })}
        </div>
      )}

      {checkinGoal && (
        <GoalCheckinModal
          goal={checkinGoal}
          onSave={async (progress, note) => {
            await onCheckin(checkinGoal.id, progress, note);
            setCheckinGoal(null);
          }}
          onDelete={async () => {
            await onRemove(checkinGoal.id);
            setCheckinGoal(null);
          }}
          onClose={() => setCheckinGoal(null)}
        />
      )}

      {showEditor && (
        <GoalEditorModal
          onSave={async (params) => {
            await onAdd(params);
            setShowEditor(false);
          }}
          onClose={() => setShowEditor(false)}
        />
      )}
    </div>
  );
}
