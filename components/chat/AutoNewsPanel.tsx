"use client";

import { useState, useCallback } from "react";
import { PERSONA_LIST, PERSONA_SPECIALTIES } from "@/lib/personas";
import type { AutoNewsConfig, PersonaId } from "@/types";

interface AutoNewsPanelProps {
  config: AutoNewsConfig | null;
  isChecking: boolean;
  lastCheckResult: string | null;
  onToggle: (enabled: boolean) => void;
  onTogglePersona: (personaId: PersonaId) => void;
  onSetCustomTopics: (topics: string[]) => void;
  onSetInterval: (minutes: number) => void;
  onManualCheck: () => void;
  onClose: () => void;
}

const INTERVAL_OPTIONS = [
  { label: "30분", value: 30 },
  { label: "1시간", value: 60 },
  { label: "2시간", value: 120 },
  { label: "3시간", value: 180 },
];

export default function AutoNewsPanel({
  config,
  isChecking,
  lastCheckResult,
  onToggle,
  onTogglePersona,
  onSetCustomTopics,
  onSetInterval,
  onManualCheck,
  onClose,
}: AutoNewsPanelProps) {
  const [topicInput, setTopicInput] = useState("");
  const enabled = config?.enabled ?? false;
  const activePersonas = config?.activePersonas ?? [];
  const customTopics = config?.customTopics ?? [];
  const intervalMinutes = config?.intervalMinutes ?? 60;

  const handleAddTopic = useCallback(() => {
    const topic = topicInput.trim();
    if (!topic || customTopics.includes(topic)) return;
    onSetCustomTopics([...customTopics, topic]);
    setTopicInput("");
  }, [topicInput, customTopics, onSetCustomTopics]);

  const handleRemoveTopic = useCallback(
    (topic: string) => {
      onSetCustomTopics(customTopics.filter((t) => t !== topic));
    },
    [customTopics, onSetCustomTopics]
  );

  // default 페르소나 제외 (자동 뉴스는 전문 페르소나만)
  const personas = PERSONA_LIST.filter((p) => p.id !== "default");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="mx-4 w-full max-w-lg rounded-2xl bg-white shadow-xl">
        {/* 헤더 */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div className="flex items-center gap-2">
            <svg className="h-5 w-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            <h2 className="text-lg font-bold text-gray-900">자동 뉴스 설정</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto px-6 py-4">
          {/* 활성화 토글 */}
          <div className="mb-6 flex items-center justify-between">
            <div>
              <p className="font-medium text-gray-900">자동 뉴스 브리핑</p>
              <p className="text-sm text-gray-500">
                AI 페르소나가 주기적으로 뉴스를 검색해서 채팅방에 공유합니다
              </p>
            </div>
            <button
              onClick={() => onToggle(!enabled)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                enabled ? "bg-blue-600" : "bg-gray-300"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
                  enabled ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>

          {enabled && (
            <>
              {/* 인터벌 설정 */}
              <div className="mb-6">
                <p className="mb-2 text-sm font-medium text-gray-700">뉴스 체크 주기</p>
                <div className="flex gap-2">
                  {INTERVAL_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => onSetInterval(opt.value)}
                      className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
                        intervalMinutes === opt.value
                          ? "bg-blue-600 text-white"
                          : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 페르소나 선택 */}
              <div className="mb-6">
                <p className="mb-2 text-sm font-medium text-gray-700">뉴스를 올릴 AI 페르소나</p>
                <div className="space-y-2">
                  {personas.map((persona) => {
                    const isActive = activePersonas.includes(persona.id);
                    const specialty = PERSONA_SPECIALTIES[persona.id];
                    return (
                      <button
                        key={persona.id}
                        onClick={() => onTogglePersona(persona.id)}
                        className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors ${
                          isActive
                            ? "border-blue-300 bg-blue-50"
                            : "border-gray-200 hover:bg-gray-50"
                        }`}
                      >
                        <span className="text-xl">{persona.icon}</span>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-900">{persona.name}</span>
                            {isActive && (
                              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700">
                                활성
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-500">{persona.description}</p>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {specialty.searchKeywords.slice(0, 3).map((kw) => (
                              <span
                                key={kw}
                                className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600"
                              >
                                {kw}
                              </span>
                            ))}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 커스텀 관심 주제 */}
              <div className="mb-6">
                <p className="mb-2 text-sm font-medium text-gray-700">
                  추가 관심 주제 (선택)
                </p>
                <p className="mb-2 text-xs text-gray-500">
                  특정 키워드를 추가하면 해당 주제의 뉴스도 함께 검색합니다
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={topicInput}
                    onChange={(e) => setTopicInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddTopic();
                      }
                    }}
                    placeholder="예: 삼성전자, 부동산, 반도체..."
                    className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none"
                  />
                  <button
                    onClick={handleAddTopic}
                    disabled={!topicInput.trim()}
                    className="rounded-lg bg-gray-100 px-3 py-2 text-sm text-gray-700 hover:bg-gray-200 disabled:opacity-50"
                  >
                    추가
                  </button>
                </div>
                {customTopics.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {customTopics.map((topic) => (
                      <span
                        key={topic}
                        className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2.5 py-1 text-xs text-purple-700"
                      >
                        {topic}
                        <button
                          onClick={() => handleRemoveTopic(topic)}
                          className="ml-0.5 hover:text-purple-900"
                        >
                          x
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* 수동 체크 & 상태 */}
              <div className="rounded-xl bg-gray-50 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-700">수동 뉴스 체크</p>
                    {lastCheckResult && (
                      <p className="mt-1 text-xs text-gray-500">{lastCheckResult}</p>
                    )}
                    {config?.lastCheckedAt && (
                      <p className="mt-0.5 text-xs text-gray-400">
                        마지막 체크: {new Date(config.lastCheckedAt.toMillis()).toLocaleTimeString("ko-KR")}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={onManualCheck}
                    disabled={isChecking || activePersonas.length === 0}
                    className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    {isChecking ? (
                      <>
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                        검색 중...
                      </>
                    ) : (
                      <>
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        지금 체크
                      </>
                    )}
                  </button>
                </div>
                {activePersonas.length === 0 && enabled && (
                  <p className="mt-2 text-xs text-amber-600">
                    뉴스를 올릴 페르소나를 1명 이상 선택해주세요
                  </p>
                )}
              </div>
            </>
          )}
        </div>

        {/* 하단 */}
        <div className="border-t border-gray-200 px-6 py-3">
          <button
            onClick={onClose}
            className="w-full rounded-lg bg-gray-100 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 transition-colors"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
