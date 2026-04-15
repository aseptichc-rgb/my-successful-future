"use client";

import { useState } from "react";
import { PERSONAS } from "@/lib/personas";
import type { BuiltinPersonaId, PersonaId } from "@/types";

type CouncilMode = "oneshot" | "live";

interface CouncilLauncherProps {
  onLaunch: (question: string, personaIds: PersonaId[], mode: CouncilMode) => Promise<void>;
  onClose: () => void;
  disabled?: boolean;
}

// 카운슬에 참여 가능한 페르소나 (뉴스봇 제외, 미래의 나는 자동 종합자로 항상 포함)
const COUNCIL_CANDIDATES: BuiltinPersonaId[] = [
  "entrepreneur",
  "fund-trader",
  "tech-cto",
  "healthcare-expert",
  "policy-analyst",
];

export default function CouncilLauncher({ onLaunch, onClose, disabled }: CouncilLauncherProps) {
  const [selected, setSelected] = useState<BuiltinPersonaId[]>([
    "entrepreneur",
    "fund-trader",
    "tech-cto",
  ]);
  const [question, setQuestion] = useState("");
  const [mode, setMode] = useState<CouncilMode>("live");
  const [launching, setLaunching] = useState(false);

  const toggle = (id: BuiltinPersonaId) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  // 라이브 모드는 질문 생략 가능 (각 페르소나가 자동수집한 기사로 토론 시작)
  const minQuestionLen = mode === "live" ? 0 : 5;
  const canLaunch =
    !launching &&
    !disabled &&
    question.trim().length >= minQuestionLen &&
    selected.length >= 1 &&
    selected.length <= 4;

  const handleLaunch = async () => {
    if (!canLaunch) return;
    setLaunching(true);
    try {
      await onLaunch(question.trim(), selected, mode);
      onClose();
    } finally {
      setLaunching(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-1 text-lg font-bold text-gray-900">🪑 카운슬 소집</h2>
        <p className="mb-4 text-xs text-gray-500">
          여러 전문가가 순서대로 의견을 내고, 마지막에 🌟 미래의 나가 종합해줍니다.
        </p>

        {/* 모드 선택 */}
        <div className="mb-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setMode("live")}
            className={`rounded-lg border px-3 py-2 text-left text-xs transition-colors ${
              mode === "live"
                ? "border-emerald-500 bg-emerald-50 text-emerald-900"
                : "border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
          >
            <div className="font-semibold">🗣️ 라이브 토론</div>
            <div className="mt-0.5 text-[11px] opacity-80">한 명씩 발언 · 사람도 끼어들 수 있음 · 자동수집 기사 활용</div>
          </button>
          <button
            type="button"
            onClick={() => setMode("oneshot")}
            className={`rounded-lg border px-3 py-2 text-left text-xs transition-colors ${
              mode === "oneshot"
                ? "border-indigo-500 bg-indigo-50 text-indigo-900"
                : "border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
          >
            <div className="font-semibold">⚡ 원샷 카운슬</div>
            <div className="mt-0.5 text-[11px] opacity-80">전원이 한 번에 의견 → 종합 (기존 방식)</div>
          </button>
        </div>

        <div className="mb-4">
          <label className="mb-2 block text-sm font-medium text-gray-700">
            전문가 선택 (1~4명)
          </label>
          <div className="grid grid-cols-2 gap-2">
            {COUNCIL_CANDIDATES.map((id) => {
              const persona = PERSONAS[id];
              const isSelected = selected.includes(id);
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => toggle(id)}
                  disabled={!isSelected && selected.length >= 4}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                    isSelected
                      ? "border-indigo-500 bg-indigo-50 text-indigo-900"
                      : "border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-40"
                  }`}
                >
                  <span className="text-base">{persona.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="truncate text-xs font-medium">{persona.name}</div>
                  </div>
                  {isSelected && (
                    <svg className="h-4 w-4 shrink-0 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex items-center gap-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <span>🌟</span>
            <span>미래의 나는 마지막 종합자로 자동 포함됩니다</span>
          </div>
        </div>

        <div className="mb-5">
          <label className="mb-2 block text-sm font-medium text-gray-700">
            질문 {mode === "live" && <span className="text-xs font-normal text-gray-400">(생략 시 오늘 자동수집된 뉴스로 토론)</span>}
          </label>
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder={
              mode === "live"
                ? "비워두면 각 전문가가 오늘 모은 기사 중 가장 중요한 이슈를 골라 토론을 시작합니다."
                : "예: 지금 다니는 회사를 나와서 창업해도 될까? 자금은 충분한데 시장 타이밍이 불안해."
            }
            rows={4}
            maxLength={500}
            className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          <div className="mt-1 text-right text-xs text-gray-400">{question.length}/500</div>
        </div>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={launching}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleLaunch}
            disabled={!canLaunch}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {launching ? "진행 중..." : `카운슬 시작 (${selected.length + 1}명)`}
          </button>
        </div>
      </div>
    </div>
  );
}
