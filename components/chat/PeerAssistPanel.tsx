"use client";

import { useState } from "react";
import type { AssistMessageInput, AssistMode, AssistResponse, ChatMessage } from "@/types";

interface PeerAssistPanelProps {
  messages: ChatMessage[];
  currentUid?: string;
  currentUserName?: string;
  userPersona?: string;
  onClose: () => void;
  onUseReply?: (text: string) => void;
}

const ACTIONS: { mode: AssistMode; label: string; icon: string; hint: string; color: string }[] = [
  {
    mode: "summarize",
    label: "대화 요약",
    icon: "📝",
    hint: "긴 대화를 한눈에",
    color: "border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-800",
  },
  {
    mode: "reply",
    label: "답장 제안",
    icon: "💬",
    hint: "3가지 톤으로 답장 초안",
    color: "border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-800",
  },
  {
    mode: "translate",
    label: "번역",
    icon: "🌐",
    hint: "최근 상대 메시지 한국어로",
    color: "border-violet-200 bg-violet-50 hover:bg-violet-100 text-violet-800",
  },
];

function toAssistInputs(
  messages: ChatMessage[],
  currentUid?: string
): AssistMessageInput[] {
  // 최근 30개, 페르소나(AI) 메시지는 제외 — 피어 대화 맥락만
  return messages
    .filter((m) => !m.personaId || m.personaId === undefined)
    .slice(-30)
    .map((m) => ({
      role: m.role,
      senderName: m.senderName,
      content: m.content,
      isMine: m.senderUid === currentUid,
    }));
}

export default function PeerAssistPanel({
  messages,
  currentUid,
  currentUserName,
  userPersona,
  onClose,
  onUseReply,
}: PeerAssistPanelProps) {
  const [activeMode, setActiveMode] = useState<AssistMode | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const runAssist = async (mode: AssistMode) => {
    setActiveMode(mode);
    setLoading(true);
    setResult(null);
    setSuggestions(null);
    setError(null);

    try {
      const inputs = toAssistInputs(messages, currentUid);
      if (inputs.length === 0) {
        setError("분석할 메시지가 없어요.");
        return;
      }

      const res = await fetch("/api/chat/assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          messages: inputs,
          currentUserName,
          targetLang: "한국어",
          userPersona: userPersona || undefined,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        setError(err?.error || `HTTP ${res.status}`);
        return;
      }

      const data: AssistResponse = await res.json();
      setResult(data.result);
      setSuggestions(data.suggestions || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };

  const handleUseReply = (text: string) => {
    if (onUseReply) {
      onUseReply(text);
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-base font-bold text-gray-900">🤖 AI 도우미</h2>
            <p className="mt-0.5 text-[11px] text-gray-500">
              이 결과는 당신에게만 보입니다. 상대방에게는 전송되지 않아요.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            aria-label="닫기"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 3개 액션 카드 */}
        <div className="mb-4 grid grid-cols-3 gap-2">
          {ACTIONS.map((a) => (
            <button
              key={a.mode}
              type="button"
              onClick={() => runAssist(a.mode)}
              disabled={loading}
              className={`flex flex-col items-center gap-1 rounded-xl border px-2 py-3 text-center transition-colors disabled:opacity-50 ${a.color} ${
                activeMode === a.mode ? "ring-2 ring-offset-1" : ""
              }`}
            >
              <span className="text-xl">{a.icon}</span>
              <span className="text-xs font-medium">{a.label}</span>
              <span className="text-[9px] opacity-70">{a.hint}</span>
            </button>
          ))}
        </div>

        {/* 결과 영역 */}
        <div className="min-h-[120px] rounded-xl border border-gray-200 bg-gray-50 p-3">
          {!activeMode && (
            <p className="text-center text-xs text-gray-400">
              위에서 원하는 작업을 선택하세요
            </p>
          )}

          {loading && (
            <div className="flex items-center justify-center gap-2 py-6 text-xs text-gray-500">
              <div className="h-3 w-3 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600" />
              <span>생각 중...</span>
            </div>
          )}

          {error && !loading && (
            <p className="text-xs text-red-600">⚠️ {error}</p>
          )}

          {!loading && !error && result && activeMode !== "reply" && (
            <div className="space-y-2">
              <div className="whitespace-pre-wrap text-sm leading-relaxed text-gray-800">
                {result}
              </div>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => handleCopy(result)}
                  className="rounded-md border border-gray-300 bg-white px-2 py-1 text-[11px] text-gray-600 hover:bg-gray-50"
                >
                  {copied ? "복사됨 ✓" : "복사"}
                </button>
              </div>
            </div>
          )}

          {!loading && !error && activeMode === "reply" && suggestions && suggestions.length > 0 && (
            <div className="space-y-2">
              <p className="text-[11px] font-medium text-gray-500">답장 초안 (클릭하면 입력창에 넣어드려요)</p>
              {suggestions.map((s, i) => {
                const labels = ["👍 따뜻한 공감", "💡 실용 행동", "🙂 간결 캐주얼"];
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => handleUseReply(s)}
                    className="flex w-full flex-col items-start gap-1 rounded-lg border border-gray-200 bg-white p-2.5 text-left transition-colors hover:border-emerald-300 hover:bg-emerald-50"
                  >
                    <span className="text-[10px] font-medium text-emerald-700">
                      {labels[i] || `초안 ${i + 1}`}
                    </span>
                    <span className="text-sm text-gray-800">{s}</span>
                  </button>
                );
              })}
            </div>
          )}

          {!loading && !error && activeMode === "reply" && suggestions && suggestions.length === 0 && (
            <p className="text-xs text-gray-500">
              답장 제안을 파싱하지 못했어요. 다시 시도해보세요.
              <br />
              <span className="text-[10px] text-gray-400">원문: {result}</span>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
