"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import {
  updateFuturePersona,
  updateUserGoals,
  onDailyEntrySnapshot,
  onDailyMotivationSnapshot,
  onIdentityProgressSnapshot,
  saveDailyWins,
  saveDailyAchievedGoals,
  getKstYmd,
  MAX_USER_GOALS,
  MAX_DAILY_WINS,
} from "@/lib/firebase";
import { authedFetch } from "@/lib/authedFetch";
import MotivationCard from "@/components/home/MotivationCard";
import IdentityProgressView from "@/components/identity/IdentityProgress";
import type {
  DailyEntry,
  DailyMotivation,
  IdentityProgress as IdentityProgressType,
} from "@/types";

const FUTURE_PERSONA_MAX = 500;
const GOAL_MAX = 80;
const WIN_MAX = 140;
const WINS_SAVED_TOAST_MS = 2000;

function formatKstHeader(ymd: string): string {
  const [y, m, d] = ymd.split("-").map((s) => parseInt(s, 10));
  if (!y || !m || !d) return ymd;
  return `${y}년 ${m}월 ${d}일`;
}

const IconSettings = ({ className = "h-5 w-5" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.04 1.56V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.11-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06A2 2 0 1 1 4.13 16.92l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1.04H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.65 8.83a1.7 1.7 0 0 0-.34-1.87l-.06-.06A2 2 0 1 1 7.08 4.07l.06.06a1.7 1.7 0 0 0 1.87.34H9a1.7 1.7 0 0 0 1.04-1.56V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1.04 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06A2 2 0 1 1 19.93 7.08l-.06.06a1.7 1.7 0 0 0-.34 1.87V9c.27.66.93 1.1 1.65 1.1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1z" />
  </svg>
);

export default function HomeDashboardPage() {
  const router = useRouter();
  const { user, firebaseUser, loading } = useAuth();

  const [futureDraft, setFutureDraft] = useState("");
  const [futureEditing, setFutureEditing] = useState(false);
  const [futureSaving, setFutureSaving] = useState(false);

  const [goals, setGoals] = useState<string[]>([]);
  const [goalDraft, setGoalDraft] = useState("");
  const goalsHydratedRef = useRef(false);

  const ymd = useMemo(() => getKstYmd(), []);
  const [wins, setWins] = useState<string[]>(["", "", ""]);
  const [savedWins, setSavedWins] = useState<string[]>(["", "", ""]);
  const [winsSaving, setWinsSaving] = useState(false);
  const [winsJustSaved, setWinsJustSaved] = useState(false);
  const [winsError, setWinsError] = useState<string | null>(null);
  const [achievedGoals, setAchievedGoals] = useState<string[]>([]);
  const dailyHydratedRef = useRef(false);
  const winsSavedToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (winsSavedToastTimerRef.current) clearTimeout(winsSavedToastTimerRef.current);
    };
  }, []);

  const [motivation, setMotivation] = useState<DailyMotivation | null>(null);
  const [motivationLoading, setMotivationLoading] = useState(true);
  const [motivationError, setMotivationError] = useState<string | null>(null);
  const [showMoreToday, setShowMoreToday] = useState(false);
  const ensureRequestedRef = useRef(false);

  const [identityEntries, setIdentityEntries] = useState<IdentityProgressType[]>([]);

  useEffect(() => {
    if (loading) return;
    if (!firebaseUser) {
      router.push("/login");
      return;
    }
    if (user && !user.onboardedAt) {
      router.replace("/onboarding");
    }
  }, [firebaseUser, loading, router, user]);

  useEffect(() => {
    if (!user) return;
    setFutureDraft(user.futurePersona || "");
    if (!goalsHydratedRef.current) {
      setGoals(user.goals && user.goals.length > 0 ? [...user.goals] : []);
      goalsHydratedRef.current = true;
    }
  }, [user]);

  useEffect(() => {
    if (!firebaseUser) return;
    const unsub = onDailyEntrySnapshot(firebaseUser.uid, ymd, (entry: DailyEntry | null) => {
      if (!entry) {
        if (!dailyHydratedRef.current) {
          setWins(["", "", ""]);
          setSavedWins(["", "", ""]);
          setAchievedGoals([]);
          dailyHydratedRef.current = true;
        }
        return;
      }
      const w = Array.isArray(entry.wins) ? entry.wins : [];
      const normalized = [0, 1, 2].map((i) => w[i] || "");
      if (!dailyHydratedRef.current) {
        setWins(normalized);
      }
      setSavedWins(normalized);
      setAchievedGoals(Array.isArray(entry.achievedGoals) ? entry.achievedGoals : []);
      dailyHydratedRef.current = true;
    });
    return unsub;
  }, [firebaseUser, ymd]);

  useEffect(() => {
    if (!firebaseUser) return;
    setMotivationLoading(true);
    let cancelled = false;
    const unsub = onDailyMotivationSnapshot(firebaseUser.uid, ymd, (m) => {
      if (cancelled) return;
      setMotivation(m);
      setMotivationLoading(false);
      if (!m && !ensureRequestedRef.current) {
        ensureRequestedRef.current = true;
        authedFetch("/api/daily-motivation", {
          method: "POST",
          body: JSON.stringify({ ymd }),
        })
          .then(async (res) => {
            if (!res.ok) {
              const data = await res.json().catch(() => ({}));
              throw new Error((data as { error?: string }).error || "동기부여 카드를 만들지 못했어요.");
            }
          })
          .catch((err) => {
            if (cancelled) return;
            setMotivationError(err instanceof Error ? err.message : String(err));
          });
      }
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, [firebaseUser, ymd]);

  const handleRegenerateMotivation = useCallback(async () => {
    setMotivationError(null);
    try {
      const res = await authedFetch("/api/daily-motivation", {
        method: "POST",
        body: JSON.stringify({ ymd, force: true }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || "다시 받기에 실패했어요.");
      }
    } catch (err) {
      setMotivationError(err instanceof Error ? err.message : String(err));
    }
  }, [ymd]);

  const handleSubmitMissionResponse = useCallback(
    async (text: string) => {
      const res = await authedFetch("/api/mission-response", {
        method: "POST",
        body: JSON.stringify({ ymd, text }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        isFirst?: boolean;
        identityTag?: string;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "응답을 저장하지 못했어요.");
      }
      return {
        isFirst: Boolean(data.isFirst),
        identityTag: data.identityTag || "",
      };
    },
    [ymd],
  );

  useEffect(() => {
    if (!firebaseUser) return;
    const unsub = onIdentityProgressSnapshot(firebaseUser.uid, (entries) => {
      setIdentityEntries(entries);
    });
    return unsub;
  }, [firebaseUser]);

  if (loading || !firebaseUser) {
    return (
      <div className="flex h-full items-center justify-center bg-[#F0EDE6]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-black/10 border-t-[#1E1B4B]" />
      </div>
    );
  }

  const uid = firebaseUser.uid;

  const handleFutureSave = async () => {
    const next = futureDraft.trim().slice(0, FUTURE_PERSONA_MAX);
    setFutureSaving(true);
    try {
      await updateFuturePersona(uid, next);
      setFutureEditing(false);
      void handleRegenerateMotivation();
    } catch (err) {
      console.error("미래의 나 저장 실패:", err);
      window.alert("저장에 실패했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setFutureSaving(false);
    }
  };

  const handleFutureCancel = () => {
    setFutureDraft(user?.futurePersona || "");
    setFutureEditing(false);
  };

  const persistGoals = async (next: string[]) => {
    try {
      await updateUserGoals(uid, next);
    } catch (err) {
      console.error("목표 저장 실패:", err);
      window.alert("목표 저장에 실패했습니다.");
    }
  };

  const handleToggleGoalAchieved = async (goalText: string) => {
    const trimmed = goalText.trim();
    if (!trimmed) return;
    const isAchieved = achievedGoals.includes(trimmed);
    const next = isAchieved
      ? achievedGoals.filter((g) => g !== trimmed)
      : [...achievedGoals, trimmed];
    setAchievedGoals(next);
    try {
      await saveDailyAchievedGoals(uid, ymd, next);
    } catch (err) {
      console.error("목표 달성 저장 실패:", err);
      setAchievedGoals(achievedGoals);
      window.alert("저장에 실패했습니다.");
    }
  };

  const pruneAchievedGoals = async (currentGoals: string[]) => {
    const valid = new Set(currentGoals.map((g) => g.trim()).filter((g) => g.length > 0));
    const pruned = achievedGoals.filter((g) => valid.has(g));
    if (pruned.length === achievedGoals.length) return;
    setAchievedGoals(pruned);
    try {
      await saveDailyAchievedGoals(uid, ymd, pruned);
    } catch (err) {
      console.error("달성 목표 정리 실패:", err);
    }
  };

  const handleAddGoal = async () => {
    const text = goalDraft.trim().slice(0, GOAL_MAX);
    if (!text) return;
    if (goals.length >= MAX_USER_GOALS) {
      window.alert(`목표는 최대 ${MAX_USER_GOALS}개까지 추가할 수 있어요.`);
      return;
    }
    const next = [...goals, text];
    setGoals(next);
    setGoalDraft("");
    await persistGoals(next);
  };

  const handleUpdateGoal = (idx: number, value: string) => {
    setGoals(goals.map((g, i) => (i === idx ? value.slice(0, GOAL_MAX) : g)));
  };

  const handleCommitGoal = async (idx: number) => {
    const trimmed = (goals[idx] || "").trim();
    if (!trimmed) {
      const next = goals.filter((_, i) => i !== idx);
      setGoals(next);
      await persistGoals(next);
      await pruneAchievedGoals(next);
      return;
    }
    const next = goals.map((g, i) => (i === idx ? trimmed : g));
    setGoals(next);
    await persistGoals(next);
    await pruneAchievedGoals(next);
  };

  const handleRemoveGoal = async (idx: number) => {
    const next = goals.filter((_, i) => i !== idx);
    setGoals(next);
    await persistGoals(next);
    await pruneAchievedGoals(next);
  };

  const handleChangeWin = (idx: number, value: string) => {
    const next = wins.map((w, i) => (i === idx ? value.slice(0, WIN_MAX) : w));
    setWins(next);
    if (winsJustSaved) setWinsJustSaved(false);
    if (winsError) setWinsError(null);
  };

  const handleSaveWins = async () => {
    setWinsSaving(true);
    setWinsError(null);
    try {
      await saveDailyWins(uid, ymd, wins);
      setSavedWins(wins);
      setWinsJustSaved(true);
      if (winsSavedToastTimerRef.current) clearTimeout(winsSavedToastTimerRef.current);
      winsSavedToastTimerRef.current = setTimeout(() => setWinsJustSaved(false), WINS_SAVED_TOAST_MS);
    } catch (err) {
      console.error("잘한 일 저장 실패:", err);
      setWinsError("저장에 실패했어요. 잠시 후 다시 시도해주세요.");
    } finally {
      setWinsSaving(false);
    }
  };

  const futureText = user?.futurePersona || "";
  const winsDirty = wins.some((w, i) => (w || "") !== (savedWins[i] || ""));
  const winsHasContent = wins.some((w) => (w || "").trim().length > 0);

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-[#F0EDE6] pb-8">
      <header className="border-b border-black/[0.06] bg-white px-5 py-5 sm:px-6 sm:py-7">
        <div className="mx-auto flex max-w-3xl items-start justify-between gap-4">
          <div>
            <h1 className="text-[28px] font-semibold leading-[1.14] tracking-[-0.005em] text-[#1E1B4B] sm:text-[32px]">
              오늘의 동기부여
            </h1>
            <p className="mt-2 text-[15px] leading-[1.47] tracking-[-0.022em] text-black/60">
              {formatKstHeader(ymd)} · 매일 새로 도착하는 한 마디로 하루를 시작하세요.
            </p>
          </div>
          <button
            type="button"
            onClick={() => router.push("/settings")}
            aria-label="설정"
            title="설정"
            className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-black/[0.06] bg-white text-[#1E1B4B] shadow-apple transition-colors hover:bg-[#F7F4ED]"
          >
            <IconSettings className="h-[18px] w-[18px]" />
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl space-y-4 px-4 py-5 sm:px-6">
        <MotivationCard
          motivation={motivation}
          loading={motivationLoading}
          errorMessage={motivationError}
          onRegenerate={handleRegenerateMotivation}
          onSubmitResponse={handleSubmitMissionResponse}
          ymd={ymd}
        />

        {motivationError && motivation && (
          <p className="rounded-[12px] bg-rose-50 px-4 py-2 text-[12px] tracking-[-0.01em] text-rose-700">
            {motivationError}
          </p>
        )}

        <IdentityProgressView identities={user?.identities} entries={identityEntries} />

        {/* 10년 후의 나의 모습 — 동기부여 카드 컨텍스트 */}
        <section className="rounded-[16px] border border-black/[0.06] bg-white p-5 shadow-apple">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-[17px] font-semibold tracking-[-0.022em] text-[#1E1B4B]">
                <svg className="h-[18px] w-[18px] text-[#1E1B4B]/70" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 3l2.6 5.4 5.9.9-4.3 4.1 1 5.9L12 16.6 6.8 19.3l1-5.9L3.5 9.3l5.9-.9L12 3z" />
                </svg>
                10년 후의 나의 모습
              </h2>
              <p className="mt-1 text-[12px] tracking-[-0.01em] text-black/56">
                되고 싶은 모습이 구체적일수록, 매일 도착하는 한 마디도 더 명확해져요.
              </p>
            </div>
            {!futureEditing && (
              <button
                type="button"
                onClick={() => setFutureEditing(true)}
                className="shrink-0 rounded-pill border border-black/[0.08] bg-white px-3 py-1.5 text-[12px] font-medium tracking-[-0.01em] text-black/70 transition-colors hover:border-[#1E1B4B] hover:text-[#1E1B4B]"
              >
                {futureText ? "수정" : "작성"}
              </button>
            )}
          </div>

          {futureEditing ? (
            <div className="mt-4">
              <textarea
                value={futureDraft}
                onChange={(e) => setFutureDraft(e.target.value)}
                rows={5}
                maxLength={FUTURE_PERSONA_MAX}
                placeholder="예: 10년 뒤 나는 매일 아침 운동과 독서로 하루를 시작하고, 가족과 충분한 시간을 보내며 좋아하는 일로 안정적인 수익을 만든다."
                className="w-full resize-none rounded-[14px] border border-black/10 bg-white px-4 py-3 text-[14px] leading-[1.5] tracking-[-0.01em] text-[#1E1B4B] placeholder:text-black/40 focus:border-[#1E1B4B] focus:outline-none"
              />
              <div className="mt-2 flex items-center justify-between text-[11px] tracking-[-0.01em] text-black/40">
                <span>{futureDraft.length}/{FUTURE_PERSONA_MAX}</span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleFutureCancel}
                    disabled={futureSaving}
                    className="rounded-pill border border-black/[0.08] bg-white px-3 py-1.5 text-[12px] font-medium text-black/70 transition-colors hover:border-black/20 disabled:opacity-50"
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    onClick={handleFutureSave}
                    disabled={futureSaving}
                    className="rounded-pill bg-[#1E1B4B] px-3 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-[#2A2766] disabled:opacity-50"
                  >
                    {futureSaving ? "저장 중…" : "저장하고 카드 다시 받기"}
                  </button>
                </div>
              </div>
            </div>
          ) : futureText ? (
            <p className="mt-4 whitespace-pre-wrap rounded-[12px] bg-[#F7F4ED] px-4 py-3 text-[14px] leading-[1.6] tracking-[-0.01em] text-[#1E1B4B]">
              {futureText}
            </p>
          ) : (
            <button
              type="button"
              onClick={() => setFutureEditing(true)}
              className="mt-4 w-full rounded-[12px] border border-dashed border-black/15 bg-[#F7F4ED] px-4 py-5 text-[13px] tracking-[-0.01em] text-black/50 transition-colors hover:border-[#1E1B4B]/40 hover:text-[#1E1B4B]"
            >
              아직 적어둔 모습이 없어요. 눌러서 작성해 보세요.
            </button>
          )}
        </section>

        {/* 나의 목표 */}
        <section className="rounded-[16px] border border-black/[0.06] bg-white p-5 shadow-apple">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="flex items-center gap-2 text-[17px] font-semibold tracking-[-0.022em] text-[#1E1B4B]">
              <svg className="h-[18px] w-[18px] text-[#1E1B4B]/70" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="9" />
                <circle cx="12" cy="12" r="5" />
                <circle cx="12" cy="12" r="1.5" fill="currentColor" />
              </svg>
              나의 목표
            </h2>
            <span className="text-[12px] tracking-[-0.01em] text-black/48">
              {goals.length}/{MAX_USER_GOALS}
            </span>
          </div>
          <div className="mt-1 flex items-baseline justify-between gap-2">
            <p className="text-[12px] tracking-[-0.01em] text-black/56">
              앞 3개 목표가 카드와 잠금화면에 함께 표시돼요. 우선순위 순서로 정리하세요.
            </p>
            {goals.length > 0 && (
              <span className="shrink-0 text-[12px] font-medium tracking-[-0.01em] text-[#1E1B4B]/70">
                오늘 {achievedGoals.filter((g) => goals.includes(g)).length}/{goals.length}
              </span>
            )}
          </div>

          {goals.length > 0 && (
            <ul className="mt-4 space-y-2">
              {goals.map((goal, idx) => {
                const trimmed = goal.trim();
                const achieved = trimmed.length > 0 && achievedGoals.includes(trimmed);
                return (
                  <li key={idx} className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleToggleGoalAchieved(goal)}
                      aria-label={achieved ? "달성 취소" : "오늘 달성으로 표시"}
                      aria-pressed={achieved}
                      title={achieved ? "오늘 달성함 — 취소하려면 클릭" : "오늘 달성으로 표시"}
                      disabled={trimmed.length === 0}
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-[11px] font-semibold transition-colors ${
                        achieved
                          ? "border-[#1E1B4B] bg-[#1E1B4B] text-white"
                          : "border-black/15 bg-[#F0EDE6] text-[#1E1B4B] hover:border-[#1E1B4B]"
                      } disabled:cursor-not-allowed disabled:opacity-40`}
                    >
                      {achieved ? (
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                          <path d="M5 12l5 5L20 7" />
                        </svg>
                      ) : (
                        idx + 1
                      )}
                    </button>
                    <input
                      value={goal}
                      maxLength={GOAL_MAX}
                      onChange={(e) => handleUpdateGoal(idx, e.target.value)}
                      onBlur={() => handleCommitGoal(idx)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          (e.currentTarget as HTMLInputElement).blur();
                        }
                      }}
                      className={`min-w-0 flex-1 rounded-[10px] border border-transparent bg-[#F7F4ED] px-3 py-2 text-[14px] tracking-[-0.01em] focus:border-[#1E1B4B] focus:bg-white focus:outline-none ${
                        achieved ? "text-black/40 line-through" : "text-[#1E1B4B]"
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveGoal(idx)}
                      aria-label="목표 삭제"
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-black/40 transition-colors hover:bg-black/[0.04] hover:text-black/80"
                    >
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 6L6 18M6 6l12 12" />
                      </svg>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {goals.length < MAX_USER_GOALS && (
            <div className="mt-3 flex items-center gap-2">
              <input
                value={goalDraft}
                maxLength={GOAL_MAX}
                onChange={(e) => setGoalDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddGoal();
                  }
                }}
                placeholder="예: 매일 30분 책 읽기"
                className="min-w-0 flex-1 rounded-[10px] border border-black/10 bg-white px-3 py-2 text-[14px] tracking-[-0.01em] text-[#1E1B4B] placeholder:text-black/40 focus:border-[#1E1B4B] focus:outline-none"
              />
              <button
                type="button"
                onClick={handleAddGoal}
                disabled={!goalDraft.trim()}
                className="shrink-0 rounded-pill bg-[#1E1B4B] px-4 py-2 text-[12px] font-medium text-white transition-colors hover:bg-[#2A2766] disabled:cursor-not-allowed disabled:opacity-40"
              >
                추가
              </button>
            </div>
          )}
        </section>

        {/* 오늘 잘한 일 */}
        <section className="rounded-[16px] border border-black/[0.06] bg-white shadow-apple">
          <button
            type="button"
            onClick={() => setShowMoreToday((v) => !v)}
            className="flex w-full items-center justify-between px-5 py-4 text-left"
            aria-expanded={showMoreToday}
          >
            <span className="flex items-center gap-2 text-[15px] font-semibold tracking-[-0.022em] text-[#1E1B4B]">
              <svg className="h-[16px] w-[16px] text-[#1E1B4B]/70" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 11l3 3L22 4" />
                <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
              </svg>
              오늘 스스로 잘한 일 {MAX_DAILY_WINS}가지
            </span>
            <svg
              className={`h-4 w-4 text-black/40 transition-transform ${showMoreToday ? "rotate-180" : ""}`}
              viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>

          {showMoreToday && (
            <div className="border-t border-black/[0.06] px-5 pb-5 pt-4">
              <div>
                <div className="flex items-baseline justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => router.push("/wins-history")}
                    className="shrink-0 text-[12px] font-medium tracking-[-0.01em] text-[#1E1B4B]/70 underline-offset-2 hover:underline hover:text-[#1E1B4B]"
                  >
                    지난 기록 보기
                  </button>
                </div>
                <p className="mt-1 text-[12px] tracking-[-0.01em] text-black/56">
                  아주 작은 일이어도 좋아요. 적은 뒤 저장하면 날짜별로 다시 볼 수 있어요.
                </p>
                <ul className="mt-3 space-y-2">
                  {[0, 1, 2].map((idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="mt-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#F0EDE6] text-[11px] font-semibold text-[#1E1B4B]">
                        {idx + 1}
                      </span>
                      <textarea
                        value={wins[idx] || ""}
                        rows={1}
                        maxLength={WIN_MAX}
                        onChange={(e) => handleChangeWin(idx, e.target.value)}
                        placeholder={
                          idx === 0
                            ? "예: 미루던 메일에 답장했다."
                            : idx === 1
                              ? "예: 아침에 10분 산책했다."
                              : "예: 가족에게 따뜻한 말 한마디를 했다."
                        }
                        className="min-h-[40px] min-w-0 flex-1 resize-none rounded-[10px] border border-black/10 bg-white px-3 py-2 text-[14px] leading-[1.45] tracking-[-0.01em] text-[#1E1B4B] placeholder:text-black/40 focus:border-[#1E1B4B] focus:outline-none"
                      />
                    </li>
                  ))}
                </ul>
                <div className="mt-3 flex items-center justify-end gap-3">
                  {winsError ? (
                    <span className="text-[12px] tracking-[-0.01em] text-rose-600">{winsError}</span>
                  ) : winsJustSaved ? (
                    <span className="flex items-center gap-1 text-[12px] tracking-[-0.01em] text-emerald-600">
                      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 12l5 5L20 7" />
                      </svg>
                      저장됐어요
                    </span>
                  ) : winsDirty ? (
                    <span className="text-[12px] tracking-[-0.01em] text-amber-600">
                      저장되지 않은 변경이 있어요
                    </span>
                  ) : winsHasContent ? (
                    <span className="text-[12px] tracking-[-0.01em] text-black/48">
                      저장된 상태예요
                    </span>
                  ) : null}
                  <button
                    type="button"
                    onClick={handleSaveWins}
                    disabled={winsSaving || !winsHasContent}
                    className="shrink-0 rounded-pill bg-[#1E1B4B] px-4 py-2 text-[12px] font-medium text-white transition-colors hover:bg-[#2A2766] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {winsSaving ? "저장 중…" : "저장"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
