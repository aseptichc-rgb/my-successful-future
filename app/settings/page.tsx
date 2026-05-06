"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import {
  updateFuturePersona,
  updateUserGoals,
  updateQuotePreference,
  MAX_USER_GOALS,
  QUOTE_PINNED_DAYS_MAX,
} from "@/lib/firebase";
import { FAMOUS_QUOTES_SEED } from "@/lib/famousQuotesSeed";

const FUTURE_PERSONA_MAX = 500;
const GOAL_MAX = 80;

const KNOWN_AUTHORS: string[] = Array.from(
  new Set(
    FAMOUS_QUOTES_SEED
      .filter((q) => q.category !== "personal")
      .map((q) => (typeof q.author === "string" ? q.author.trim() : ""))
      .filter((a) => a.length > 0),
  ),
).sort((a, b) => a.localeCompare(b, "ko"));

export default function SettingsPage() {
  const router = useRouter();
  const { user, firebaseUser, loading: authLoading, signOut, refreshUser } = useAuth();

  const [futureDraft, setFutureDraft] = useState("");
  const [futureSaving, setFutureSaving] = useState(false);

  const [goals, setGoals] = useState<string[]>([]);
  const [goalsSaving, setGoalsSaving] = useState(false);

  const [pinnedAuthor, setPinnedAuthor] = useState<string>("");
  const [pinnedDays, setPinnedDays] = useState<number>(0);
  const [quoteSaving, setQuoteSaving] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!firebaseUser) {
      router.replace("/login");
    }
  }, [authLoading, firebaseUser, router]);

  useEffect(() => {
    if (!user) return;
    setFutureDraft(user.futurePersona || "");
    setGoals(user.goals && user.goals.length > 0 ? [...user.goals] : []);
    setPinnedAuthor(user.quotePreference?.pinnedAuthor || "");
    setPinnedDays(user.quotePreference?.pinnedDaysPerWeek ?? 0);
  }, [user]);

  const goalCount = useMemo(() => goals.filter((g) => g.trim().length > 0).length, [goals]);

  if (authLoading || !firebaseUser) {
    return (
      <div className="flex h-full items-center justify-center bg-[#F0EDE6]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-black/10 border-t-[#1E1B4B]" />
      </div>
    );
  }

  const uid = firebaseUser.uid;

  const handleSaveFuture = async () => {
    setFutureSaving(true);
    try {
      await updateFuturePersona(uid, futureDraft.trim().slice(0, FUTURE_PERSONA_MAX));
      await refreshUser().catch(() => {});
    } catch (err) {
      console.error("미래의 나 저장 실패:", err);
      window.alert("저장에 실패했습니다.");
    } finally {
      setFutureSaving(false);
    }
  };

  const handleAddGoalRow = () => {
    setGoals((prev) => (prev.length >= MAX_USER_GOALS ? prev : [...prev, ""]));
  };

  const handleGoalChange = (idx: number, value: string) => {
    setGoals((prev) => prev.map((g, i) => (i === idx ? value.slice(0, GOAL_MAX) : g)));
  };

  const handleRemoveGoalRow = (idx: number) => {
    setGoals((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSaveGoals = async () => {
    setGoalsSaving(true);
    try {
      const cleaned = goals.map((g) => g.trim()).filter((g) => g.length > 0);
      await updateUserGoals(uid, cleaned);
      await refreshUser().catch(() => {});
    } catch (err) {
      console.error("목표 저장 실패:", err);
      window.alert("저장에 실패했습니다.");
    } finally {
      setGoalsSaving(false);
    }
  };

  const handleSaveQuotePreference = async () => {
    setQuoteSaving(true);
    try {
      await updateQuotePreference(uid, {
        pinnedAuthor: pinnedAuthor.trim() || undefined,
        pinnedDaysPerWeek: pinnedDays || undefined,
      });
      await refreshUser().catch(() => {});
    } catch (err) {
      console.error("명언 큐레이션 저장 실패:", err);
      window.alert("저장에 실패했습니다.");
    } finally {
      setQuoteSaving(false);
    }
  };

  return (
    <div className="flex h-full flex-col bg-[#F0EDE6]">
      <header className="border-b border-black/[0.06] bg-white px-5 py-5 sm:px-6 sm:py-7">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4">
          <div>
            <h1 className="text-[28px] font-semibold leading-[1.14] tracking-[-0.005em] text-[#1E1B4B] sm:text-[32px]">
              설정
            </h1>
            <p className="mt-2 text-[15px] leading-[1.47] tracking-[-0.022em] text-black/60">
              미래의 모습 · 목표 · 오늘의 명언 큐레이션을 한곳에서 관리해요.
            </p>
          </div>
          <button
            type="button"
            onClick={() => router.push("/home")}
            className="shrink-0 rounded-pill bg-[#F0EDE6] px-4 py-2 text-[13px] font-medium text-black/70 transition-colors hover:bg-black/[0.06]"
          >
            닫기
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-5 py-8 sm:px-6">
        <div className="mx-auto max-w-3xl space-y-4">
          {/* 10년 후의 나 */}
          <section className="rounded-[18px] bg-white p-5 shadow-apple">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-[16px] font-semibold tracking-[-0.022em] text-[#1E1B4B]">
                10년 후의 나의 모습
              </h2>
              <span className="text-[11px] tracking-[-0.01em] text-black/40">
                {futureDraft.length}/{FUTURE_PERSONA_MAX}
              </span>
            </div>
            <p className="mt-1 text-[12px] tracking-[-0.01em] text-black/56">
              매일 도착하는 동기부여 한 마디가 이 글을 바탕으로 만들어져요.
            </p>
            <textarea
              value={futureDraft}
              onChange={(e) => setFutureDraft(e.target.value.slice(0, FUTURE_PERSONA_MAX))}
              rows={6}
              maxLength={FUTURE_PERSONA_MAX}
              placeholder="예: 10년 뒤 나는 매일 아침 운동과 독서로 하루를 시작하고, 가족과 충분한 시간을 보내며 좋아하는 일로 안정적인 수익을 만든다."
              className="mt-3 w-full resize-none rounded-[12px] border border-black/10 bg-white px-3 py-2.5 text-[14px] leading-[1.6] tracking-[-0.01em] text-[#1E1B4B] placeholder:text-black/40 focus:border-[#1E1B4B] focus:outline-none"
            />
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={handleSaveFuture}
                disabled={futureSaving}
                className="rounded-pill bg-[#1E1B4B] px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-[#2A2766] disabled:opacity-50"
              >
                {futureSaving ? "저장 중…" : "저장"}
              </button>
            </div>
          </section>

          {/* 나의 목표 */}
          <section className="rounded-[18px] bg-white p-5 shadow-apple">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-[16px] font-semibold tracking-[-0.022em] text-[#1E1B4B]">
                나의 목표
              </h2>
              <span className="text-[11px] tracking-[-0.01em] text-black/40">
                {goalCount}/{MAX_USER_GOALS}
              </span>
            </div>
            <p className="mt-1 text-[12px] tracking-[-0.01em] text-black/56">
              앞 3개 목표가 매일 카드와 잠금화면에 함께 표시돼요.
            </p>

            {goals.length === 0 ? (
              <p className="mt-4 rounded-[10px] border border-dashed border-black/15 bg-[#F7F4ED] px-3 py-3 text-center text-[12px] text-black/50">
                홈 화면에서 목표를 추가하면 여기서도 편집할 수 있어요.
              </p>
            ) : (
              <ul className="mt-4 space-y-2">
                {goals.map((goal, idx) => (
                  <li key={idx} className="flex items-center gap-2">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#1E1B4B]/10 text-[12px] font-semibold text-[#1E1B4B]">
                      {idx + 1}
                    </span>
                    <input
                      value={goal}
                      maxLength={GOAL_MAX}
                      onChange={(e) => handleGoalChange(idx, e.target.value)}
                      className="min-w-0 flex-1 rounded-[10px] border border-black/10 bg-white px-3 py-2 text-[14px] tracking-[-0.01em] text-[#1E1B4B] focus:border-[#1E1B4B] focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveGoalRow(idx)}
                      aria-label="목표 줄 제거"
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-black/40 transition-colors hover:bg-black/[0.04] hover:text-black/80"
                    >
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 6L6 18M6 6l12 12" />
                      </svg>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-3 flex items-center justify-between gap-2">
              {goals.length < MAX_USER_GOALS ? (
                <button
                  type="button"
                  onClick={handleAddGoalRow}
                  className="rounded-pill border border-dashed border-black/15 bg-white px-3 py-1.5 text-[12px] font-medium tracking-[-0.01em] text-black/60 transition-colors hover:border-[#1E1B4B] hover:text-[#1E1B4B]"
                >
                  + 목표 추가
                </button>
              ) : <span />}
              <button
                type="button"
                onClick={handleSaveGoals}
                disabled={goalsSaving}
                className="rounded-pill bg-[#1E1B4B] px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-[#2A2766] disabled:opacity-50"
              >
                {goalsSaving ? "저장 중…" : "저장"}
              </button>
            </div>
          </section>

          {/* 오늘의 명언 큐레이션 */}
          <section className="rounded-[18px] bg-white p-5 shadow-apple">
            <h2 className="text-[16px] font-semibold tracking-[-0.022em] text-[#1E1B4B]">
              오늘의 명언 큐레이션
            </h2>
            <p className="mt-1 text-[12px] tracking-[-0.01em] text-black/56">
              비워두면 매주 자동 회전. 핀할 인물과 노출 빈도를 직접 설정할 수도 있어요.
            </p>

            <label className="mt-4 block text-[12px] font-semibold tracking-[-0.01em] text-black/70">
              핀할 인물
            </label>
            <select
              value={pinnedAuthor}
              onChange={(e) => setPinnedAuthor(e.target.value)}
              className="mt-1.5 w-full rounded-[10px] border border-black/10 bg-white px-3 py-2 text-[14px] tracking-[-0.01em] text-[#1E1B4B] focus:border-[#1E1B4B] focus:outline-none"
            >
              <option value="">— 핀하지 않음 (주간 자동 회전) —</option>
              {KNOWN_AUTHORS.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>

            <label className="mt-4 block text-[12px] font-semibold tracking-[-0.01em] text-black/70">
              주당 핀 인물 노출 일수: <span className="font-bold text-[#1E1B4B]">{pinnedDays === 0 ? "꺼짐" : pinnedDays === QUOTE_PINNED_DAYS_MAX ? "매일" : `주 ${pinnedDays}일`}</span>
            </label>
            <input
              type="range"
              min={0}
              max={QUOTE_PINNED_DAYS_MAX}
              step={1}
              value={pinnedDays}
              onChange={(e) => setPinnedDays(parseInt(e.target.value, 10))}
              className="mt-2 w-full"
            />

            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={handleSaveQuotePreference}
                disabled={quoteSaving}
                className="rounded-pill bg-[#1E1B4B] px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-[#2A2766] disabled:opacity-50"
              >
                {quoteSaving ? "저장 중…" : "저장"}
              </button>
            </div>
          </section>

          {/* 계정 */}
          <section className="rounded-[18px] bg-white p-5 shadow-apple">
            <h2 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-black/48">계정</h2>
            <div className="mt-3 flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-medium tracking-[-0.022em] text-[#1E1B4B]">
                  {user?.displayName || "—"}
                </p>
                <p className="truncate text-[12px] tracking-[-0.01em] text-black/56">
                  {user?.email || firebaseUser.email || "—"}
                </p>
              </div>
              <button
                type="button"
                onClick={async () => {
                  await signOut();
                  router.push("/login");
                }}
                className="shrink-0 rounded-pill border border-black/10 px-4 py-2 text-[13px] font-medium text-black/70 transition-colors hover:bg-black/[0.04]"
              >
                로그아웃
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
