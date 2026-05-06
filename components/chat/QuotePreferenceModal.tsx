"use client";

import { useEffect, useState } from "react";
import { authedFetch } from "@/lib/authedFetch";
import {
  QUOTE_PINNED_DAYS_MAX,
  QUOTE_PINNED_DAYS_MIN,
  updateQuotePreference,
} from "@/lib/firebase";
import type { QuotePreference } from "@/types";

const AUTHOR_MAX_LEN = 60;

const FREQ_OPTIONS: ReadonlyArray<{ value: number; label: string }> = [
  { value: 0, label: "꺼짐 (자동 회전)" },
  { value: 1, label: "주 1일" },
  { value: 2, label: "주 2일" },
  { value: 3, label: "주 3일" },
  { value: 4, label: "주 4일" },
  { value: 5, label: "주 5일" },
  { value: 6, label: "주 6일" },
  { value: 7, label: "매일" },
];

interface QuotePreferenceModalProps {
  uid: string;
  preference: QuotePreference | undefined;
  onSaved: () => void | Promise<void>;
  onClose: () => void;
}

export default function QuotePreferenceModal({
  uid,
  preference,
  onSaved,
  onClose,
}: QuotePreferenceModalProps) {
  const [author, setAuthor] = useState<string>(preference?.pinnedAuthor ?? "");
  const [days, setDays] = useState<number>(
    typeof preference?.pinnedDaysPerWeek === "number" ? preference.pinnedDaysPerWeek : 0,
  );
  const [busy, setBusy] = useState<"idle" | "save" | "fetch">("idle");
  const [error, setError] = useState<string | null>(null);
  const [recommended, setRecommended] = useState<string[]>([]);
  const [recLoading, setRecLoading] = useState(false);
  const [recError, setRecError] = useState<string | null>(null);

  // 진입 시 추천 인물 1회 로드
  useEffect(() => {
    let cancelled = false;
    setRecLoading(true);
    setRecError(null);
    authedFetch("/api/quote-authors/recommend", { method: "POST" })
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as {
          authors?: string[];
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok) {
          throw new Error(data.error || "추천 인물을 불러오지 못했어요.");
        }
        setRecommended(Array.isArray(data.authors) ? data.authors : []);
      })
      .catch((e) => {
        if (cancelled) return;
        setRecError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setRecLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const sanitizedAuthor = author.trim().slice(0, AUTHOR_MAX_LEN);
  const normalizedDays = sanitizedAuthor ? days : 0;

  const persistPreference = async () => {
    await updateQuotePreference(uid, {
      pinnedAuthor: sanitizedAuthor || undefined,
      pinnedDaysPerWeek: normalizedDays,
    });
  };

  const handleSave = async () => {
    if (busy !== "idle") return;
    setError(null);
setBusy("save");
    try {
      await persistPreference();
      await onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장에 실패했어요.");
    } finally {
      setBusy("idle");
    }
  };

  const handleFetchNow = async () => {
    if (busy !== "idle") return;
    if (!sanitizedAuthor) {
      setError("받아볼 인물을 먼저 입력해주세요.");
      return;
    }
    setError(null);
setBusy("fetch");
    try {
      // 현재 입력값을 저장도 같이 (단, 빈도 0 이면 그대로 유지)
      await persistPreference();
      const res = await authedFetch("/api/daily-motivation", {
        method: "POST",
        body: JSON.stringify({ overrideAuthor: sanitizedAuthor }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || "명언을 받아오지 못했어요.");
      }
      await onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "받아오기에 실패했어요.");
    } finally {
      setBusy("idle");
    }
  };

  const handleReset = async () => {
    if (busy !== "idle") return;
    setError(null);
    setBusy("save");
    try {
      await updateQuotePreference(uid, { pinnedAuthor: undefined, pinnedDaysPerWeek: 0 });
      setAuthor("");
      setDays(0);
      await onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "초기화에 실패했어요.");
    } finally {
      setBusy("idle");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="mx-4 w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">📜 오늘의 명언 큐레이션</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            aria-label="닫기"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <p className="mb-4 text-sm text-gray-500">
          매주 인물 풀이 자동으로 회전해요. 받고 싶은 인물을 직접 적고 빈도를 정하면, 한 주 안에서 그
          일수만큼 그 사람의 명언이 우선 노출됩니다. 시드에 없는 인물도 입력 가능 — AI 가 그 사람의 실제
          발언을 가져옵니다.
        </p>

        {/* 인물 입력 */}
        <label className="mb-4 block">
          <span className="mb-1.5 block text-xs font-semibold tracking-[-0.01em] text-gray-600">
            받고 싶은 인물 (자유 입력)
          </span>
          <input
            type="text"
            value={author}
            onChange={(e) => setAuthor(e.target.value.slice(0, AUTHOR_MAX_LEN))}
            placeholder="예: 프리드리히 니체 / 스티브 잡스 / 마하트마 간디"
            disabled={busy !== "idle"}
            className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 disabled:opacity-50"
          />
          <span className="mt-1 block text-right text-[11px] text-gray-400">
            {author.length}/{AUTHOR_MAX_LEN}
          </span>
        </label>

        {/* 추천 인물 */}
        <div className="mb-4">
          <p className="mb-2 text-xs font-semibold tracking-[-0.01em] text-gray-600">
            나에게 도움이 될 만한 인물 (AI 추천)
          </p>
          {recLoading ? (
            <div className="flex gap-2">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="h-7 w-20 animate-pulse rounded-full bg-gray-100"
                />
              ))}
            </div>
          ) : recError ? (
            <p className="text-xs text-rose-600">{recError}</p>
          ) : recommended.length === 0 ? (
            <p className="text-xs text-gray-400">추천을 불러오지 못했어요.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {recommended.map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => setAuthor(a)}
                  disabled={busy !== "idle"}
                  className="rounded-full border border-gray-200 px-3 py-1.5 text-xs text-gray-700 transition-colors hover:border-amber-300 hover:bg-amber-50 hover:text-amber-700 disabled:opacity-50"
                >
                  {a}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 빈도 */}
        <label className="mb-5 block">
          <span className="mb-1.5 block text-xs font-semibold tracking-[-0.01em] text-gray-600">
            노출 빈도 (인물을 입력했을 때만 적용)
          </span>
          <select
            value={days}
            onChange={(e) => setDays(parseInt(e.target.value, 10))}
            disabled={busy !== "idle" || !sanitizedAuthor}
            className="w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 disabled:opacity-50"
          >
            {FREQ_OPTIONS.filter(
              (o) =>
                o.value >= QUOTE_PINNED_DAYS_MIN && o.value <= QUOTE_PINNED_DAYS_MAX,
            ).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        {/* 즉시 받아보기 — 강조 */}
        <button
          type="button"
          onClick={handleFetchNow}
          disabled={busy !== "idle" || !sanitizedAuthor}
          className="mb-3 w-full rounded-xl bg-amber-500 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy === "fetch" ? "받아오는 중…" : "지금 바로 이 인물의 명언 받아보기"}
        </button>

        {error && (
          <p className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-[12px] tracking-[-0.01em] text-rose-700">
            {error}
          </p>
        )}

        <div className="flex items-center justify-between">
          <button
            onClick={handleReset}
            disabled={busy !== "idle" || (!preference?.pinnedAuthor && !preference?.pinnedDaysPerWeek)}
            className="rounded-lg px-4 py-2 text-sm text-red-500 transition-colors hover:bg-red-50 disabled:opacity-30"
          >
            초기화
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-50"
            >
              취소
            </button>
            <button
              onClick={handleSave}
              disabled={busy !== "idle"}
              className="rounded-lg bg-[#1E1B4B] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#2A2766] disabled:opacity-50"
            >
              {busy === "save" ? "저장 중…" : "설정 저장"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
