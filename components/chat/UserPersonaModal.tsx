"use client";

import { useState } from "react";

const PERSONA_EXAMPLES = [
  "자산 1조원의 성공한 사업가. IT와 부동산에 주로 투자하며, 새로운 사업 기회를 항상 찾고 있습니다.",
  "의대 본과 3학년 학생. 디지털헬스케어와 AI 의료에 관심이 많습니다.",
  "실리콘밸리에서 10년간 일한 시니어 개발자. 현재 한국에서 스타트업을 준비 중입니다.",
  "국회 보좌관으로 5년째 일하는 정책 전문가. 경제 정책과 규제에 관심이 있습니다.",
  "20대 대학생. 주식과 코인 투자에 관심이 많고, 경제 공부를 시작했습니다.",
];

interface UserPersonaModalProps {
  currentPersona: string;
  onSave: (persona: string) => void;
  onClose: () => void;
}

export default function UserPersonaModal({
  currentPersona,
  onSave,
  onClose,
}: UserPersonaModalProps) {
  const [persona, setPersona] = useState(currentPersona);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await onSave(persona.trim());
    setSaving(false);
    onClose();
  };

  const handleClear = async () => {
    setSaving(true);
    setPersona("");
    await onSave("");
    setSaving(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="mx-4 w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">내 페르소나 설정</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <p className="mb-3 text-sm text-gray-500">
          나를 어떤 사람으로 소개할지 적어주세요. AI 페르소나들이 이에 맞춰 대화합니다.
        </p>

        <textarea
          value={persona}
          onChange={(e) => setPersona(e.target.value)}
          placeholder="예: 자산 1조원의 성공한 사업가. IT 분야 투자에 관심이 많습니다."
          rows={4}
          maxLength={500}
          className="mb-3 w-full resize-none rounded-xl border border-gray-300 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />

        <div className="mb-4 text-right text-xs text-gray-400">
          {persona.length}/500
        </div>

        {/* 예시 */}
        <div className="mb-5">
          <p className="mb-2 text-xs font-medium text-gray-500">예시 (클릭하면 적용)</p>
          <div className="flex flex-wrap gap-2">
            {PERSONA_EXAMPLES.map((example, i) => (
              <button
                key={i}
                onClick={() => setPersona(example)}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 transition-colors"
              >
                {example.length > 30 ? example.slice(0, 30) + "..." : example}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between">
          <button
            onClick={handleClear}
            disabled={saving || !currentPersona}
            className="rounded-lg px-4 py-2 text-sm text-red-500 hover:bg-red-50 disabled:opacity-30 transition-colors"
          >
            초기화
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
              취소
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {saving ? "저장 중..." : "저장"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
