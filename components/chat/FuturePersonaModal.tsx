"use client";

import { useState } from "react";

const FUTURE_PERSONA_EXAMPLES = [
  "10년 뒤 자산 100억의 부동산 투자가가 되어 주 3일만 일하고 가족과 시간을 보낸다. 매일 새벽 5시에 일어나 시장 분석을 하고, 멘토링 모임을 운영한다.",
  "5년 뒤 디지털헬스케어 스타트업의 CTO로서 직원 30명 규모의 의료 AI 솔루션을 운영하고 있다. 매년 학회에서 발표하며 업계 영향력을 키워간다.",
  "7년 뒤 베스트셀러 작가가 되어 책 인세로 자유롭게 살고 있다. 하루에 3시간 글을 쓰고, 나머지 시간은 여행과 독서로 채운다.",
  "10년 뒤 연봉 5억의 시니어 펀드매니저로 일하며, 월 1회 해외 출장을 다니고 한강뷰 아파트에서 산다. 운동과 건강 관리를 절대 빠뜨리지 않는다.",
  "5년 뒤 1인 크리에이터로 구독자 50만 명의 채널을 운영하며, 광고와 강연으로 월 3천만 원을 번다. 좋아하는 일을 하면서도 경제적 자유를 얻었다.",
];

interface FuturePersonaModalProps {
  currentFuturePersona: string;
  onSave: (persona: string) => void;
  onClose: () => void;
}

export default function FuturePersonaModal({
  currentFuturePersona,
  onSave,
  onClose,
}: FuturePersonaModalProps) {
  const [persona, setPersona] = useState(currentFuturePersona);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(persona.trim());
      onClose();
    } catch (err) {
      console.error("미래 페르소나 저장 실패:", err);
      alert("저장에 실패했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    setSaving(true);
    try {
      setPersona("");
      await onSave("");
      onClose();
    } catch (err) {
      console.error("미래 페르소나 초기화 실패:", err);
      alert("초기화에 실패했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="mx-4 w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">🌟 미래의 나 정의하기</h2>
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
          5년, 10년 뒤 어떤 모습이 되고 싶나요? 직업, 라이프스타일, 성취, 가치관 등을 자유롭게 적어보세요.
          이 정보를 바탕으로 미래의 나가 오늘의 당신에게 메시지를 보냅니다.
        </p>

        <textarea
          value={persona}
          onChange={(e) => setPersona(e.target.value)}
          placeholder="예: 10년 뒤 디지털헬스케어 스타트업의 CEO로서 직원 50명을 이끌고 있다. 매일 아침 운동과 독서로 하루를 시작하고, 가족과 저녁을 함께한다."
          rows={5}
          maxLength={500}
          className="mb-3 w-full resize-none rounded-xl border border-gray-300 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
        />

        <div className="mb-4 text-right text-xs text-gray-400">
          {persona.length}/500
        </div>

        {/* 예시 */}
        <div className="mb-5">
          <p className="mb-2 text-xs font-medium text-gray-500">예시 (클릭하면 적용)</p>
          <div className="flex flex-wrap gap-2">
            {FUTURE_PERSONA_EXAMPLES.map((example, i) => (
              <button
                key={i}
                onClick={() => setPersona(example)}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 hover:border-amber-300 hover:bg-amber-50 hover:text-amber-700 transition-colors"
              >
                {example.length > 35 ? example.slice(0, 35) + "..." : example}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between">
          <button
            onClick={handleClear}
            disabled={saving || !currentFuturePersona}
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
              className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50 transition-colors"
            >
              {saving ? "저장 중..." : "저장"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
