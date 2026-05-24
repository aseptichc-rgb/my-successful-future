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
import { notifyAndroidWidgetRefresh } from "@/lib/widgetBridge";
import MotivationCard from "@/components/home/MotivationCard";
import { useLanguage } from "@/lib/i18n";
import type { DailyEntry, DailyMotivation } from "@/types";

/* ─────────────────────────────────────────────────────────────────
 * Anima Home — v2 redesign
 * ─────────────────────────────────────────────────────────────────
 * 원칙(브랜드 시스템 문서 + Widget Directive 적용):
 *  · 한 평면, 한 톤 — cream 위에 hairline + 여백으로 분리. 카드 금지.
 *  · 인용·페르소나·번호는 Fraunces 300 italic.
 *  · 컨트롤은 숨김 — 편집/삭제는 명시적 편집 모드에서만.
 *  · 저장 버튼 없음 — wins 는 600ms debounce auto-save, 우상단 mono 토스트.
 *  · 페이지 헤더 우상단에 streak dot + 숫자 고정 (위젯과 동일 위치).
 *
 * 비즈니스 로직(Firebase, i18n, 라우팅, qDate 핸드오프)은 v1 그대로 유지.
 * ────────────────────────────────────────────────────────────────── */

const FUTURE_PERSONA_MAX = 500;
const GOAL_MAX = 80;
const WIN_MAX = 140;
const WINS_AUTOSAVE_MS = 600;
const WINS_SAVED_TOAST_MS = 1800;
const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

/* ───── qDate 핸드오프 — Widget → /home ymd 권위 ───── */
function readQDateFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const v = new URL(window.location.href).searchParams.get("qDate");
    return v && YMD_RE.test(v) ? v : null;
  } catch {
    return null;
  }
}

function useResolvedYmd(): string {
  const [ymd, setYmd] = useState<string>(() => readQDateFromUrl() ?? getKstYmd());
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.has("qDate")) {
        url.searchParams.delete("qDate");
        window.history.replaceState({}, "", url.toString());
      }
    } catch {
      /* noop */
    }
    const syncForward = () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      const live = getKstYmd();
      setYmd((cur) => (live > cur ? live : cur));
    };
    document.addEventListener("visibilitychange", syncForward);
    window.addEventListener("focus", syncForward);
    return () => {
      document.removeEventListener("visibilitychange", syncForward);
      window.removeEventListener("focus", syncForward);
    };
  }, []);
  return ymd;
}

/* ───── 메타 스트립용 날짜 포맷 — mono · uppercase ─────
 * "5 · 24" + 요일 약자 + ISO 주차. 본문과 한 톤으로 들어가도록 짧게.
 */
function formatMetaDate(ymd: string, locale: string): { dm: string; dow: string; week: string } {
  const [y, m, d] = ymd.split("-").map((s) => parseInt(s, 10));
  if (!y || !m || !d) return { dm: ymd, dow: "", week: "" };
  try {
    const date = new Date(Date.UTC(y, m - 1, d));
    const dowFmt = new Intl.DateTimeFormat(
      locale === "ko" ? "ko-KR" : locale === "es" ? "es-ES" : locale === "zh" ? "zh-CN" : "en-US",
      { weekday: "short", timeZone: "UTC" },
    ).format(date);
    // ISO week number
    const tmp = new Date(Date.UTC(y, m - 1, d));
    const dayNum = (tmp.getUTCDay() + 6) % 7;
    tmp.setUTCDate(tmp.getUTCDate() - dayNum + 3);
    const firstThursday = tmp.valueOf();
    tmp.setUTCMonth(0, 1);
    if (tmp.getUTCDay() !== 4) {
      tmp.setUTCMonth(0, 1 + ((4 - tmp.getUTCDay() + 7) % 7));
    }
    const weekNum = 1 + Math.ceil((firstThursday - tmp.valueOf()) / 604800000);
    return {
      dm: `${m} · ${d}`,
      dow: dowFmt.toUpperCase(),
      week: `WEEK ${String(weekNum).padStart(2, "0")}`,
    };
  } catch {
    return { dm: ymd, dow: "", week: "" };
  }
}

/* ───── 아이콘 — gear 만 남김. 섹션 헤더 아이콘은 전부 제거 ───── */
const IconGear = ({ className = "h-5 w-5" }: { className?: string }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.4}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.04 1.56V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.11-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06A2 2 0 1 1 4.13 16.92l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1.04H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.65 8.83a1.7 1.7 0 0 0-.34-1.87l-.06-.06A2 2 0 1 1 7.08 4.07l.06.06a1.7 1.7 0 0 0 1.87.34H9a1.7 1.7 0 0 0 1.04-1.56V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1.04 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06A2 2 0 1 1 19.93 7.08l-.06.06a1.7 1.7 0 0 0-.34 1.87V9c.27.66.93 1.1 1.65 1.1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1z" />
  </svg>
);

const IconX = ({ className = "h-4 w-4" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M18 6L6 18M6 6l12 12" />
  </svg>
);

const IconCheck = ({ className = "h-4 w-4" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M5 12l5 5L20 7" />
  </svg>
);

export default function HomeDashboardPage() {
  const router = useRouter();
  const { user, firebaseUser, loading, refreshUser } = useAuth();
  const { t, locale } = useLanguage();

  /* ── future persona ── */
  const [futureDraft, setFutureDraft] = useState("");
  const [futureEditing, setFutureEditing] = useState(false);
  const [futureSaving, setFutureSaving] = useState(false);

  /* ── goals ── */
  const [goals, setGoals] = useState<string[]>([]);
  const [goalDraft, setGoalDraft] = useState("");
  const [goalsEditing, setGoalsEditing] = useState(false); // 페이지 레벨 편집 모드
  const goalsHydratedRef = useRef(false);

  /* ── ymd-bound daily state ── */
  const ymd = useResolvedYmd();
  const [wins, setWins] = useState<string[]>(["", "", ""]);
  const [savedWins, setSavedWins] = useState<string[]>(["", "", ""]);
  const [winsAutoSaving, setWinsAutoSaving] = useState(false);
  const [winsJustSaved, setWinsJustSaved] = useState(false);
  const [winsError, setWinsError] = useState<string | null>(null);
  const [achievedGoals, setAchievedGoals] = useState<string[]>([]);
  const dailyHydratedRef = useRef(false);
  const winsSavedToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const winsAutosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (winsSavedToastTimerRef.current) clearTimeout(winsSavedToastTimerRef.current);
      if (winsAutosaveTimerRef.current) clearTimeout(winsAutosaveTimerRef.current);
    };
  }, []);

  /* ── motivation card ── */
  const [motivation, setMotivation] = useState<DailyMotivation | null>(null);
  const [motivationLoading, setMotivationLoading] = useState(true);
  const [motivationError, setMotivationError] = useState<string | null>(null);
  const ensureRequestedYmdRef = useRef<string | null>(null);
  const [alreadyCheckedInToday, setAlreadyCheckedInToday] = useState(false);

  /* ── tabs ──
   * v1 의 "future"/"actions" 라벨 그대로 유지(스토리지/i18n 키 호환).
   * 의미 재정의는 Phase 4 (CHANGES.md 참조).
   */
  const [activeTab, setActiveTab] = useState<"future" | "actions">("future");

  /* ───── auth gate ───── */
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

  /* ───── hydrate from user profile ───── */
  useEffect(() => {
    if (!user) return;
    setFutureDraft(user.futurePersona || "");
    if (!goalsHydratedRef.current) {
      setGoals(user.goals && user.goals.length > 0 ? [...user.goals] : []);
      goalsHydratedRef.current = true;
    }
  }, [user]);

  /* ───── daily entry subscribe ───── */
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

  /* ───── motivation subscribe + generate ───── */
  useEffect(() => {
    if (!firebaseUser) return;
    setMotivationLoading(true);
    let cancelled = false;
    const unsub = onDailyMotivationSnapshot(firebaseUser.uid, ymd, (m) => {
      if (cancelled) return;
      setMotivation(m);
      setMotivationLoading(false);
      if (!m && ensureRequestedYmdRef.current !== ymd) {
        ensureRequestedYmdRef.current = ymd;
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
      const data = (await res.json().catch(() => ({}))) as {
        motivation?: DailyMotivation;
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error || "다시 받기에 실패했어요.");
      }
      if (data.motivation) {
        setMotivation(data.motivation);
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

  /* ───── affirmation check-in subscribe + submit ───── */
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
      if (data.matched) {
        await refreshUser().catch(() => {});
        notifyAndroidWidgetRefresh();
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
      <div className="flex h-full items-center justify-center bg-cream">
        <div className="h-6 w-6 animate-spin rounded-full border-[1.5px] border-indigo/15 border-t-indigo" />
      </div>
    );
  }

  const uid = firebaseUser.uid;

  /* ───── handlers ───── */

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
      notifyAndroidWidgetRefresh();
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
      notifyAndroidWidgetRefresh();
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

  /* ───── wins auto-save ─────
   * 저장 버튼을 제거하고 입력 변경 시 600ms debounce 후 Firebase 에 저장.
   * 저장 직후 "저장됨" 토스트 1.8s. 빈 입력만 있을 때는 저장 스킵.
   */
  const handleChangeWin = (idx: number, value: string) => {
    const next = wins.map((w, i) => (i === idx ? value.slice(0, WIN_MAX) : w));
    setWins(next);
    if (winsJustSaved) setWinsJustSaved(false);
    if (winsError) setWinsError(null);

    // 변경이 savedWins 와 동일하면 저장 트리거 안 함.
    const dirty = next.some((w, i) => (w || "") !== (savedWins[i] || ""));
    const hasContent = next.some((w) => (w || "").trim().length > 0);
    if (winsAutosaveTimerRef.current) clearTimeout(winsAutosaveTimerRef.current);
    if (!dirty || !hasContent) return;
    winsAutosaveTimerRef.current = setTimeout(() => {
      void doAutoSaveWins(next);
    }, WINS_AUTOSAVE_MS);
  };

  const doAutoSaveWins = async (snapshot: string[]) => {
    setWinsAutoSaving(true);
    setWinsError(null);
    try {
      await saveDailyWins(uid, ymd, snapshot);
      setSavedWins(snapshot);
      setWinsJustSaved(true);
      notifyAndroidWidgetRefresh();
      if (winsSavedToastTimerRef.current) clearTimeout(winsSavedToastTimerRef.current);
      winsSavedToastTimerRef.current = setTimeout(
        () => setWinsJustSaved(false),
        WINS_SAVED_TOAST_MS,
      );
    } catch (err) {
      console.error("[home] 잘한 일 자동 저장 실패:", err);
      setWinsError(t("home.wins.saveFailed"));
    } finally {
      setWinsAutoSaving(false);
    }
  };

  const futureText = user?.futurePersona || "";
  const streakCount = user?.affirmationStreak?.count ?? 0;
  const meta = formatMetaDate(ymd, locale);
  const goalsDone = achievedGoals.filter((g) => goals.includes(g)).length;

  /* ───── render ───── */

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-cream pb-12">
      {/* ── meta strip — 흰 헤더 제거. cream 한 톤 ── */}
      <header className="flex items-center justify-between px-5 pt-5 pb-3 sm:px-7">
        <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-indigo/45">
          <b className="font-medium text-indigo">{meta.dm}</b>
          {meta.dow && <span> · {meta.dow}</span>}
          {meta.week && <span> · {meta.week}</span>}
        </div>
        <div className="flex items-center gap-4">
          {streakCount > 0 && (
            <span
              className="flex items-center gap-1.5 font-mono text-[11px] text-indigo/60"
              aria-label={`${streakCount} day streak`}
            >
              <span
                className="block h-1.5 w-1.5 rounded-full bg-soul"
                style={{ boxShadow: "0 0 6px var(--soul)" }}
                aria-hidden
              />
              <span className="tracking-[0.1em]">STREAK {streakCount}</span>
            </span>
          )}
          <button
            type="button"
            onClick={() => router.push("/settings")}
            aria-label={t("home.settingsAria")}
            title={t("home.settingsAria")}
            className="-m-2 p-2 text-indigo/55 transition-colors hover:text-indigo"
          >
            <IconGear className="h-5 w-5" />
          </button>
        </div>
      </header>

      {/* ── tabs — 텍스트 + 1.5px Soul 밑줄 인디케이터 ── */}
      <div role="tablist" aria-label={t("home.title")} className="border-b border-hairline px-5 sm:px-7">
        <div className="mx-auto flex max-w-3xl gap-6">
          {(["future", "actions"] as const).map((tab) => {
            const selected = activeTab === tab;
            const count =
              tab === "future"
                ? alreadyCheckedInToday
                  ? `✓`
                  : ""
                : goals.length > 0
                  ? `${goalsDone}/${goals.length}`
                  : "";
            return (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setActiveTab(tab)}
                className={`-mb-px flex items-baseline gap-1.5 border-b-[1.5px] pb-3 pt-2 text-[14px] font-medium tracking-[-0.01em] transition-colors ${
                  selected
                    ? "border-soul text-indigo"
                    : "border-transparent text-indigo/55 hover:text-indigo"
                }`}
              >
                <span>{t(tab === "future" ? "home.tab.future" : "home.tab.actions")}</span>
                {count && (
                  <span className="font-mono text-[10px] tracking-[0.06em] text-indigo/40">
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <main className="mx-auto w-full max-w-3xl">
        {/* ─────────────────────────────────────────────
         * Tab · 오늘 (future) — MotivationCard 하나만.
         * 카드 안에 AffirmationCheckin 이 포함되어 있어 인용 + 의식이 한 흐름.
         * ───────────────────────────────────────────── */}
        {activeTab === "future" && (
          <div className="px-5 pt-6 sm:px-7">
            <MotivationCard
              motivation={motivation}
              loading={motivationLoading}
              errorMessage={motivationError}
              onRegenerate={handleRegenerateMotivation}
              onSubmitResponse={handleSubmitMissionResponse}
              affirmations={user?.successAffirmations ?? []}
              affirmationStreakCount={streakCount}
              alreadyCheckedInToday={alreadyCheckedInToday}
              onCheckinAffirmations={handleAffirmationCheckin}
              ymd={ymd}
            />
            {motivationError && motivation && (
              <p className="mt-3 px-1 text-[11px] font-medium tracking-[-0.005em] text-soul">
                {motivationError}
              </p>
            )}
          </div>
        )}

        {/* ─────────────────────────────────────────────
         * Tab · 나의 행동 (actions)
         *   · 10년 후의 나 (페르소나)
         *   · 이번 달 목표
         *   · 오늘의 작은 승리  ← v1 "잘한 일 3가지"
         * ───────────────────────────────────────────── */}
        {activeTab === "actions" && (
          <>
            {/* ── 10년 후의 나 ── */}
            <section className="px-5 pt-7 pb-7 sm:px-7">
              <div className="flex items-baseline justify-between">
                <span className="text-[12px] font-medium tracking-[-0.005em] text-indigo/55">
                  {t("home.future.title")}
                </span>
                {!futureEditing && (
                  <button
                    type="button"
                    onClick={() => setFutureEditing(true)}
                    className="text-[12px] font-medium tracking-[-0.005em] text-indigo/60 transition-colors hover:text-soul"
                  >
                    {futureText ? t("common.edit") : t("common.write")}
                  </button>
                )}
              </div>

              {futureEditing ? (
                <div className="mt-3">
                  <textarea
                    value={futureDraft}
                    onChange={(e) => setFutureDraft(e.target.value)}
                    rows={5}
                    maxLength={FUTURE_PERSONA_MAX}
                    placeholder={t("onboarding.step1.placeholder")}
                    className="w-full resize-none border-b border-hairline bg-transparent pb-2 font-display text-[17px] font-light leading-[1.55] tracking-[-0.005em] text-indigo placeholder:font-light placeholder:text-indigo/35 focus:border-indigo focus:outline-none"
                  />
                  <div className="mt-3 flex items-center justify-between">
                    <span className="font-mono text-[10px] tabular-nums text-indigo/45">
                      {futureDraft.length}/{FUTURE_PERSONA_MAX}
                    </span>
                    <div className="flex gap-4">
                      <button
                        type="button"
                        onClick={handleFutureCancel}
                        disabled={futureSaving}
                        className="text-[12px] font-medium tracking-[-0.005em] text-indigo/60 transition-colors hover:text-indigo disabled:opacity-40"
                      >
                        {t("common.cancel")}
                      </button>
                      <button
                        type="button"
                        onClick={handleFutureSave}
                        disabled={futureSaving}
                        className="text-[12px] font-medium tracking-[-0.005em] text-soul transition-colors hover:text-soul-press disabled:opacity-40"
                      >
                        {futureSaving
                          ? t("common.saving")
                          : t("home.future.saveAndRegen")}
                      </button>
                    </div>
                  </div>
                </div>
              ) : futureText ? (
                <p className="mt-3 whitespace-pre-wrap font-display text-[17px] font-light leading-[1.55] tracking-[-0.005em] text-indigo/95">
                  {futureText}
                </p>
              ) : (
                <button
                  type="button"
                  onClick={() => setFutureEditing(true)}
                  className="mt-3 block w-full text-left font-display text-[15px] font-light leading-[1.55] text-indigo/35 transition-colors hover:text-indigo/55"
                >
                  {t("home.future.empty")}
                </button>
              )}
            </section>

            <div className="mx-5 h-px bg-hairline sm:mx-7" />

            {/* ── 이번 달 목표 ── */}
            <section className="px-5 pt-7 pb-7 sm:px-7">
              <div className="flex items-baseline justify-between">
                <span className="text-[12px] font-medium tracking-[-0.005em] text-indigo/55">
                  {t("home.goals.title")}
                </span>
                <div className="flex items-center gap-4">
                  <span className="font-mono text-[11px] text-indigo/60">
                    <b className="font-medium text-indigo">{goalsDone}</b>
                    <span className="text-indigo/40"> / {goals.length}</span>
                  </span>
                  {goals.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setGoalsEditing((v) => !v)}
                      className="text-[12px] font-medium tracking-[-0.005em] text-indigo/60 transition-colors hover:text-soul"
                    >
                      {goalsEditing ? t("common.done") : t("common.edit")}
                    </button>
                  )}
                </div>
              </div>

              {goals.length > 0 && (
                <ul className="mt-2">
                  {goals.map((goal, idx) => {
                    const trimmed = goal.trim();
                    const achieved =
                      trimmed.length > 0 && achievedGoals.includes(trimmed);
                    const num = String(idx + 1).padStart(2, "0");
                    return (
                      <li
                        key={idx}
                        className="grid grid-cols-[28px_1fr_auto] items-center gap-3 border-b border-hairline py-3 last:border-b-0"
                      >
                        {/* 번호 — display italic Soul. tap-to-toggle 달성 */}
                        <button
                          type="button"
                          onClick={() => handleToggleGoalAchieved(goal)}
                          aria-label={
                            achieved
                              ? t("home.goals.toggleUnachievedAria")
                              : t("home.goals.toggleAchievedAria")
                          }
                          aria-pressed={achieved}
                          disabled={trimmed.length === 0}
                          className={`relative font-display text-[22px] font-light leading-none italic transition-colors disabled:opacity-40 ${
                            achieved
                              ? "text-indigo/40"
                              : "text-soul hover:text-soul-press"
                          }`}
                        >
                          {achieved ? (
                            <IconCheck className="h-5 w-5 text-indigo/55" />
                          ) : (
                            num
                          )}
                        </button>

                        {/* 텍스트 — 편집 모드일 때만 input, 평시는 정적 텍스트 */}
                        {goalsEditing ? (
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
                            className="min-w-0 border-b border-dashed border-indigo/20 bg-transparent py-1 text-[14px] tracking-[-0.005em] text-indigo focus:border-indigo focus:outline-none"
                          />
                        ) : (
                          <div
                            className={`min-w-0 text-[14px] leading-[1.45] tracking-[-0.005em] ${
                              achieved
                                ? "text-indigo/40 line-through decoration-indigo/20"
                                : "text-indigo"
                            }`}
                          >
                            {trimmed || (
                              <span className="font-display font-light text-indigo/35">
                                {t("home.goals.placeholder")}
                              </span>
                            )}
                          </div>
                        )}

                        {/* 오른쪽 슬롯: 편집 모드면 ×, 평시면 빈 공간(향후 진척 bar 자리) */}
                        <div className="flex justify-end">
                          {goalsEditing ? (
                            <button
                              type="button"
                              onClick={() => handleRemoveGoal(idx)}
                              aria-label={t("home.goals.deleteAria")}
                              className="-m-1.5 p-1.5 text-indigo/35 transition-colors hover:text-soul"
                            >
                              <IconX className="h-4 w-4" />
                            </button>
                          ) : (
                            <span className="w-4" aria-hidden />
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}

              {/* 새 목표 추가 — 편집 모드일 때만, 또는 비어 있을 때 ghost */}
              {goalsEditing && goals.length < MAX_USER_GOALS && (
                <div className="mt-3 grid grid-cols-[28px_1fr_auto] items-center gap-3 py-1">
                  <span className="font-mono text-[11px] text-indigo/35">＋</span>
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
                    className="min-w-0 border-b border-dashed border-indigo/20 bg-transparent py-1 text-[14px] tracking-[-0.005em] text-indigo placeholder:text-indigo/35 focus:border-indigo focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleAddGoal}
                    disabled={!goalDraft.trim()}
                    className="text-[12px] font-medium tracking-[-0.005em] text-soul transition-colors hover:text-soul-press disabled:opacity-30"
                  >
                    {t("common.add")}
                  </button>
                </div>
              )}

              {/* 목록이 비었을 때 — 빈 상태 prompt */}
              {goals.length === 0 && !goalsEditing && (
                <button
                  type="button"
                  onClick={() => setGoalsEditing(true)}
                  className="mt-3 block w-full text-left font-display text-[15px] font-light text-indigo/35 transition-colors hover:text-indigo/55"
                >
                  {t("home.goals.subtitle")}
                </button>
              )}
            </section>

            <div className="mx-5 h-px bg-hairline sm:mx-7" />

            {/* ── 오늘의 작은 승리 (wins) — auto-save ── */}
            <section className="px-5 pt-7 pb-7 sm:px-7">
              <div className="flex items-baseline justify-between">
                <span className="text-[12px] font-medium tracking-[-0.005em] text-indigo/55">
                  {t("home.wins.title", { max: MAX_DAILY_WINS })}
                </span>
                <div className="flex items-center gap-4">
                  {winsError ? (
                    <span className="text-[11px] font-medium tracking-[-0.005em] text-soul">
                      {winsError}
                    </span>
                  ) : winsJustSaved ? (
                    <span className="text-[11px] font-medium tracking-[-0.005em] text-soul">
                      {t("common.saved")}
                    </span>
                  ) : winsAutoSaving ? (
                    <span className="text-[11px] font-medium tracking-[-0.005em] text-indigo/45">
                      {t("common.saving")}
                    </span>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => router.push("/wins-history")}
                    className="text-[12px] font-medium tracking-[-0.005em] text-indigo/60 transition-colors hover:text-soul"
                  >
                    {t("home.wins.history")}
                  </button>
                </div>
              </div>

              <ul className="mt-2">
                {[0, 1, 2].map((idx) => {
                  const num = String(idx + 1).padStart(2, "0");
                  const placeholder =
                    idx === 0
                      ? t("home.wins.placeholder1")
                      : idx === 1
                        ? t("home.wins.placeholder2")
                        : t("home.wins.placeholder3");
                  return (
                    <li
                      key={idx}
                      className="flex items-start gap-3 border-b border-hairline py-3 last:border-b-0"
                    >
                      <span className="w-7 shrink-0 pt-[2px] font-display text-[22px] font-light italic leading-none text-soul">
                        {num}
                      </span>
                      <textarea
                        value={wins[idx] || ""}
                        rows={1}
                        maxLength={WIN_MAX}
                        onChange={(e) => handleChangeWin(idx, e.target.value)}
                        placeholder={placeholder}
                        className="min-h-[24px] min-w-0 flex-1 resize-none border-none bg-transparent p-0 text-[14px] leading-[1.55] tracking-[-0.005em] text-indigo placeholder:font-display placeholder:font-light placeholder:text-indigo/35 focus:outline-none"
                      />
                    </li>
                  );
                })}
              </ul>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
