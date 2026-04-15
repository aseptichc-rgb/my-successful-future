"use client";

import { useState, useCallback } from "react";
import type { KeywordAlertConfig } from "@/types";
import { MAX_SCHEDULED_SLOTS, HHMM_PATTERN } from "@/lib/constants/keyword-alert";

interface KeywordAlertPanelProps {
  config: KeywordAlertConfig | null;
  isChecking: boolean;
  lastCheckResult: string | null;
  onToggle: (enabled: boolean) => void;
  onSetKeywords: (keywords: string[]) => void;
  onSetInterval: (minutes: number) => void;
  onManualCheck: () => void;
  onClose: () => void;
  // 정시 알림 (서버 크론)
  onToggleScheduled: (enabled: boolean) => void;
  onAddScheduledTime: (hhmm: string) => void;
  onRemoveScheduledTime: (hhmm: string) => void;
}

const INTERVAL_OPTIONS = [
  { label: "30분", value: 30 },
  { label: "1시간", value: 60 },
  { label: "2시간", value: 120 },
  { label: "3시간", value: 180 },
  { label: "12시간", value: 720 },
  { label: "24시간", value: 1440 },
];

const MAX_KEYWORDS = 10;

export default function KeywordAlertPanel({
  config,
  isChecking,
  lastCheckResult,
  onToggle,
  onSetKeywords,
  onSetInterval,
  onManualCheck,
  onClose,
  onToggleScheduled,
  onAddScheduledTime,
  onRemoveScheduledTime,
}: KeywordAlertPanelProps) {
  const [input, setInput] = useState("");
  const [timeInput, setTimeInput] = useState("");
  const enabled = config?.enabled ?? false;
  const keywords = config?.keywords ?? [];
  const intervalMinutes = config?.intervalMinutes ?? 60;
  const scheduledEnabled = config?.scheduledEnabled ?? false;
  const scheduledTimes = config?.scheduledTimes ?? [];

  const handleAddTime = useCallback(() => {
    if (!HHMM_PATTERN.test(timeInput)) return;
    if (scheduledTimes.length >= MAX_SCHEDULED_SLOTS) return;
    onAddScheduledTime(timeInput);
    setTimeInput("");
  }, [timeInput, scheduledTimes, onAddScheduledTime]);

  const handleAdd = useCallback(() => {
    const k = input.trim();
    if (!k) return;
    if (keywords.includes(k)) {
      setInput("");
      return;
    }
    if (keywords.length >= MAX_KEYWORDS) return;
    onSetKeywords([...keywords, k]);
    setInput("");
  }, [input, keywords, onSetKeywords]);

  const handleRemove = useCallback(
    (k: string) => {
      onSetKeywords(keywords.filter((x) => x !== k));
    },
    [keywords, onSetKeywords]
  );

  const canCheck = enabled && keywords.length > 0 && !isChecking;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="mx-4 w-full max-w-lg rounded-2xl bg-white shadow-xl">
        {/* 헤더 */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div className="flex items-center gap-2">
            <span className="text-xl">🔔</span>
            <h2 className="text-lg font-bold text-gray-900">내 키워드 알림</h2>
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
              <p className="font-medium text-gray-900">키워드 알림</p>
              <p className="text-sm text-gray-500">
                내가 등록한 키워드의 새 뉴스가 있으면 정해진 주기마다 채팅방에 알려줍니다
              </p>
            </div>
            <button
              onClick={() => onToggle(!enabled)}
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                enabled ? "bg-rose-500" : "bg-gray-300"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
                  enabled ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>

          {/* 주기 설정 */}
          <div className="mb-6">
            <p className="mb-2 text-sm font-medium text-gray-700">검색 주기</p>
            <div className="flex flex-wrap gap-2">
              {INTERVAL_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => onSetInterval(opt.value)}
                  className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
                    intervalMinutes === opt.value
                      ? "bg-rose-500 text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* 정시 알림 (서버 크론) */}
          <div className="mb-6 rounded-xl border border-rose-100 bg-rose-50/40 p-4">
            <div className="mb-2 flex items-start justify-between gap-3">
              <div>
                <p className="flex items-center gap-1 font-medium text-gray-900">
                  ⏰ 정시 알림
                </p>
                <p className="mt-0.5 text-xs text-gray-500">
                  지정한 시각마다 키워드 뉴스를 채팅방으로 자동 전달합니다 (브라우저를 닫아도 작동, KST 기준 약 ±10분 오차).
                </p>
              </div>
              <button
                onClick={() => onToggleScheduled(!scheduledEnabled)}
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                  scheduledEnabled ? "bg-rose-500" : "bg-gray-300"
                }`}
                aria-label="정시 알림 토글"
              >
                <span
                  className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
                    scheduledEnabled ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>

            <div className="mt-3 flex gap-2">
              <input
                type="time"
                value={timeInput}
                onChange={(e) => setTimeInput(e.target.value)}
                disabled={scheduledTimes.length >= MAX_SCHEDULED_SLOTS}
                className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-rose-500 focus:outline-none disabled:bg-gray-100"
              />
              <button
                onClick={handleAddTime}
                disabled={
                  !HHMM_PATTERN.test(timeInput) ||
                  scheduledTimes.length >= MAX_SCHEDULED_SLOTS
                }
                className="rounded-lg bg-rose-500 px-4 py-2 text-sm font-medium text-white hover:bg-rose-600 disabled:opacity-50"
              >
                시각 추가
              </button>
            </div>

            {scheduledTimes.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {scheduledTimes.map((slot) => (
                  <span
                    key={slot.time}
                    className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 text-xs font-medium text-rose-700 ring-1 ring-rose-200"
                  >
                    🕐 {slot.time}
                    <button
                      onClick={() => onRemoveScheduledTime(slot.time)}
                      className="ml-0.5 hover:text-rose-900"
                      aria-label={`${slot.time} 삭제`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-xs text-gray-500">
                예: 08:00, 18:00 — 아침/저녁으로 핵심 키워드 브리핑을 받아보세요. 최대 {MAX_SCHEDULED_SLOTS}개.
              </p>
            )}
          </div>

          {/* 키워드 입력 */}
          <div className="mb-6">
            <p className="mb-2 text-sm font-medium text-gray-700">
              키워드 ({keywords.length}/{MAX_KEYWORDS})
            </p>
            <p className="mb-2 text-xs text-gray-500">
              관심 있는 키워드를 직접 등록하세요. 하나라도 새 뉴스가 있으면 알려줍니다.
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAdd();
                  }
                }}
                placeholder="예: 비트코인, 금리, OpenAI..."
                disabled={keywords.length >= MAX_KEYWORDS}
                className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-rose-500 focus:outline-none disabled:bg-gray-100"
              />
              <button
                onClick={handleAdd}
                disabled={!input.trim() || keywords.length >= MAX_KEYWORDS}
                className="rounded-lg bg-rose-500 px-4 py-2 text-sm font-medium text-white hover:bg-rose-600 disabled:opacity-50"
              >
                추가
              </button>
            </div>
            {keywords.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {keywords.map((k) => (
                  <span
                    key={k}
                    className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-3 py-1 text-xs text-rose-700"
                  >
                    {k}
                    <button
                      onClick={() => handleRemove(k)}
                      className="ml-0.5 hover:text-rose-900"
                      aria-label={`${k} 삭제`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
            {keywords.length === 0 && (
              <p className="mt-2 text-xs text-amber-600">
                키워드를 1개 이상 등록해야 알림이 작동합니다
              </p>
            )}
          </div>

          {/* 수동 체크 & 상태 */}
          <div className="rounded-xl bg-gray-50 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-700">지금 바로 체크</p>
                {lastCheckResult && (
                  <p className="mt-1 truncate text-xs text-gray-500">{lastCheckResult}</p>
                )}
                {config?.lastCheckedAt && (
                  <p className="mt-0.5 text-xs text-gray-400">
                    마지막 체크: {new Date(config.lastCheckedAt.toMillis()).toLocaleTimeString("ko-KR")}
                  </p>
                )}
              </div>
              <button
                onClick={onManualCheck}
                disabled={!canCheck}
                className="flex shrink-0 items-center gap-1.5 rounded-lg bg-rose-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-rose-600 disabled:opacity-50"
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
          </div>
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
