"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import {
  updateFuturePersona,
  updateUserGoals,
  onDailyEntrySnapshot,
  onDailyMotivationSnapshot,
  onAffirmationCheckinSnapshot,
  saveDailyWins,
  saveDailyAchievedGoals,
  getKstYmd,
  MAX_USER_GOALS,
  MAX_DAILY_WINS,
} from "@/lib/firebase";
import { authedFetch } from "@/lib/authedFetch";
import MotivationCard from "@/components/home/MotivationCard";
import { useLanguage } from "@/lib/i18n";
import type {
  DailyEntry,
  DailyMotivation,
} from "@/types";

const FUTURE_PERSONA_MAX = 500;
const GOAL_MAX = 80;
const WIN_MAX = 140;
const WINS_SAVED_TOAST_MS = 2000;

function formatKstHeader(ymd: string, locale: string): string {
  const [y, m, d] = ymd.split("-").map((s) => parseInt(s, 10));
  if (!y || !m || !d) return ymd;
  try {
    const date = new Date(Date.UTC(y, m - 1, d));
    return new Intl.DateTimeFormat(
      locale === "ko" ? "ko-KR" : locale === "es" ? "es-ES" : locale === "zh" ? "zh-CN" : "en-US",
      { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" },
    ).format(date);
  } catch {
    return ymd;
  }
}

const IconSettings = ({ className = "h-5 w-5" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.04 1.56V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.11-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06A2 2 0 1 1 4.13 16.92l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1.04H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.65 8.83a1.7 1.7 0 0 0-.34-1.87l-.06-.06A2 2 0 1 1 7.08 4.07l.06.06a1.7 1.7 0 0 0 1.87.34H9a1.7 1.7 0 0 0 1.04-1.56V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1.04 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06A2 2 0 1 1 19.93 7.08l-.06.06a1.7 1.7 0 0 0-.34 1.87V9c.27.66.93 1.1 1.65 1.1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1z" />
  </svg>
);

export default function HomeDashboardPage() {
  const router = useRouter();
  const { user, firebaseUser, loading, refreshUser } = useAuth();
  const { t, locale } = useLanguage();

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
  const ensureRequestedRef = useRef(false);

  const [alreadyCheckedInToday, setAlreadyCheckedInToday] = useState(false);

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
    const unsub = onAffirmationCheckinSnapshot(firebaseUser.uid, ymd, (checked) => {
      setAlreadyCheckedInToday(checked);
    });
    return unsub;
  }, [firebaseUser, ymd]);

  const handleAffirmationCheckin = useCallback(
    async (texts: string[]) => {
      const res = await authedFetch("/api/affirmation-checkin", {
        method: "POST",
        body: JSON.stringify({ ymd, texts }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        matched?: boolean;
        streakCount?: number;
        mismatchedIndices?: number[];
        error?: string;
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "체크인을 저장하지 못했어요.");
      }
      // 새로 체크인됐으면 user 프로필을 다시 불러와 streak.count 를 갱신.
      if (data.matched) {
        await refreshUser().catch(() => {});
      }
      return {
        matched: Boolean(data.matched),
        streakCount: Number(data.streakCount ?? 0),
        mismatchedIndices: data.mismatchedIndices,
      };
    },
    [ymd, refreshUser],
  );

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
      console.error("[home] 미래의 나 저장 실패:", err);
      window.alert(`${t("common.saveFailed")} ${t("common.tryAgainLater")}`);
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
      console.error("[home] 목표 저장 실패:", err);
      window.alert(t("home.goals.saveFailed"));
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
      console.error("[home] 목표 달성 저장 실패:", err);
      setAchievedGoals(achievedGoals);
      window.alert(t("common.saveFailed"));
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
      window.alert(t("home.goals.maxAlert", { max: MAX_USER_GOALS }));
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
      console.error("[home] 잘한 일 저장 실패:", err);
      setWinsError(t("home.wins.saveFailed"));
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
              {t("home.title")}
            </h1>
            <p className="mt-2 text-[15px] leading-[1.47] tracking-[-0.022em] text-black/60">
              {formatKstHeader(ymd, locale)} · {t("home.subtitle")}
            </p>
          </div>
          <button
            type="button"
            onClick={() => router.push("/settings")}
            aria-label={t("home.settingsAria")}
            title={t("home.settingsAria")}
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
          affirmations={user?.successAffirmations ?? []}
          affirmationStreakCount={user?.affirmationStreak?.count ?? 0}
          alreadyCheckedInToday={alreadyCheckedInToday}
          onCheckinAffirmations={handleAffirmationCheckin}
          ymd={ymd}
        />

        {motivationError && motivation && (
          <p className="rounded-[12px] bg-rose-50 px-4 py-2 text-[12px] tracking-[-0.01em] text-rose-700">
            {motivationError}
          </p>
        )}

        {/* 10년 후의 나의 모습 — 동기부여 카드 컨텍스트 */}
        <section className="rounded-[16px] border border-black/[0.06] bg-white p-5 shadow-apple">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-[17px] font-semibold tracking-[-0.022em] text-[#1E1B4B]">
                <svg className="h-[18px] w-[18px] text-[#1E1B4B]/70" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 3l2.6 5.4 5.9.9-4.3 4.1 1 5.9L12 16.6 6.8 19.3l1-5.9L3.5 9.3l5.9-.9L12 3z" />
                </svg>
                {t("home.future.title")}
              </h2>
              <p className="mt-1 text-[12px] tracking-[-0.01em] text-black/56">
                {t("home.future.subtitle")}
              </p>
            </div>
            {!futureEditing && (
              <button
                type="button"
                onClick={() => setFutureEditing(true)}
                className="shrink-0 rounded-pill border border-black/[0.08] bg-white px-3 py-1.5 text-[12px] font-medium tracking-[-0.01em] text-black/70 transition-colors hover:border-[#1E1B4B] hover:text-[#1E1B4B]"
              >
                {futureText ? t("common.edit") : t("common.write")}
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
                placeholder={t("onboarding.step1.placeholder")}
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
                    {t("common.cancel")}
                  </button>
                  <button
                    type="button"
                    onClick={handleFutureSave}
                    disabled={futureSaving}
                    className="rounded-pill bg-[#1E1B4B] px-3 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-[#2A2766] disabled:opacity-50"
                  >
                    {futureSaving ? t("common.saving") : t("home.future.saveAndRegen")}
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
              {t("home.future.empty")}
            </button>
          )}
        </section>

        {/* 목표를 이루기 위한 오늘의 행동 */}
        <section className="rounded-[16px] border border-black/[0.06] bg-white p-5 shadow-apple">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="flex items-center gap-2 text-[17px] font-semibold tracking-[-0.022em] text-[#1E1B4B]">
              <svg className="h-[18px] w-[18px] text-[#1E1B4B]/70" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="9" />
                <circle cx="12" cy="12" r="5" />
                <circle cx="12" cy="12" r="1.5" fill="currentColor" />
              </svg>
              {t("home.goals.title")}
            </h2>
            <span className="text-[12px] tracking-[-0.01em] text-black/48">
              {goals.length}/{MAX_USER_GOALS}
            </span>
          </div>
          <div className="mt-1 flex items-baseline justify-between gap-2">
            <p className="text-[12px] tracking-[-0.01em] text-black/56">
              {t("home.goals.subtitle")}
            </p>
            {goals.length > 0 && (
              <span className="shrink-0 text-[12px] font-medium tracking-[-0.01em] text-[#1E1B4B]/70">
                {t("home.goals.todayProgress", {
                  done: achievedGoals.filter((g) => goals.includes(g)).length,
                  total: goals.length,
                })}
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
                      aria-label={achieved ? t("home.goals.toggleUnachievedAria") : t("home.goals.toggleAchievedAria")}
                      aria-pressed={achieved}
                      title={achieved ? t("home.goals.toggleUnachievedTitle") : t("home.goals.toggleAchievedTitle")}
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
                      aria-label={t("home.goals.deleteAria")}
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
                placeholder={t("home.goals.placeholder")}
                className="min-w-0 flex-1 rounded-[10px] border border-black/10 bg-white px-3 py-2 text-[14px] tracking-[-0.01em] text-[#1E1B4B] placeholder:text-black/40 focus:border-[#1E1B4B] focus:outline-none"
              />
              <button
                type="button"
                onClick={handleAddGoal}
                disabled={!goalDraft.trim()}
                className="shrink-0 rounded-pill bg-[#1E1B4B] px-4 py-2 text-[12px] font-medium text-white transition-colors hover:bg-[#2A2766] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {t("common.add")}
              </button>
            </div>
          )}
        </section>

        {/* 오늘 잘한 일 — 항상 펼쳐진 상태로 노출. */}
        <section className="rounded-[16px] border border-black/[0.06] bg-white p-5 shadow-apple">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="flex items-center gap-2 text-[17px] font-semibold tracking-[-0.022em] text-[#1E1B4B]">
              <svg className="h-[18px] w-[18px] text-[#1E1B4B]/70" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 11l3 3L22 4" />
                <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
              </svg>
              {t("home.wins.title", { max: MAX_DAILY_WINS })}
            </h2>
            <button
              type="button"
              onClick={() => router.push("/wins-history")}
              className="shrink-0 text-[12px] font-medium tracking-[-0.01em] text-[#1E1B4B]/70 underline-offset-2 hover:text-[#1E1B4B] hover:underline"
            >
              {t("home.wins.history")}
            </button>
          </div>
          <p className="mt-1 text-[12px] tracking-[-0.01em] text-black/56">
            {t("home.wins.subtitle")}
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
                      ? t("home.wins.placeholder1")
                      : idx === 1
                        ? t("home.wins.placeholder2")
                        : t("home.wins.placeholder3")
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
                {t("common.saved")}
              </span>
            ) : winsDirty ? (
              <span className="text-[12px] tracking-[-0.01em] text-amber-600">
                {t("common.unsavedChanges")}
              </span>
            ) : winsHasContent ? (
              <span className="text-[12px] tracking-[-0.01em] text-black/48">
                {t("common.savedState")}
              </span>
            ) : null}
            <button
              type="button"
              onClick={handleSaveWins}
              disabled={winsSaving || !winsHasContent}
              className="shrink-0 rounded-pill bg-[#1E1B4B] px-4 py-2 text-[12px] font-medium text-white transition-colors hover:bg-[#2A2766] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {winsSaving ? t("common.saving") : t("common.save")}
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
