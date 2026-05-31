"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import {
  onDailyEntrySnapshot,
  onDailyMotivationSnapshot,
  onAffirmationCheckinSnapshot,
  saveDailyWins,
  saveDailyAchievedGoals,
  getKstYmd,
  MAX_DAILY_WINS,
} from "@/lib/firebase";
import { authedFetch } from "@/lib/authedFetch";
import { notifyAndroidWidgetRefresh } from "@/lib/widgetBridge";
import MotivationCard from "@/components/home/MotivationCard";
import Logo from "@/components/ui/Logo";
import { useLanguage } from "@/lib/i18n";
import type { DailyEntry, DailyMotivation } from "@/types";

/* ─────────────────────────────────────────────────────────────────
 * Anima Home — Apple iOS native redesign
 * ─────────────────────────────────────────────────────────────────
 *  · Large Title nav + Segmented Control
 *  · Grouped Inset Lists (rounded white cards on systemGroupedBackground)
 *  · 12-color iOS system palette — per-row category colors
 *  · Orange streak chip in nav · gradient hero quote card
 *  · 600ms debounce auto-save for wins · no save button
 *  · Goal edit mode hides ×/inputs by default
 * ────────────────────────────────────────────────────────────────── */

const WIN_MAX = 140;
const WINS_AUTOSAVE_MS = 600;
const WINS_SAVED_TOAST_MS = 1800;
const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

// 3개 슬롯(다짐·작은 승리·목표) 배지는 모두 동일 indigo — 차분한 인상.
const SLOT_COLORS = ["#1E1B4B", "#1E1B4B", "#1E1B4B"];

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

/** Long date for the Large Title subtitle ("2026년 5월 24일 화요일"). */
function formatLongDate(ymd: string, locale: string): string {
  const [y, m, d] = ymd.split("-").map((s) => parseInt(s, 10));
  if (!y || !m || !d) return ymd;
  try {
    const date = new Date(Date.UTC(y, m - 1, d));
    return new Intl.DateTimeFormat(
      locale === "ko" ? "ko-KR" : locale === "es" ? "es-ES" : locale === "zh" ? "zh-CN" : "en-US",
      { year: "numeric", month: "long", day: "numeric", weekday: "long", timeZone: "UTC" },
    ).format(date);
  } catch {
    return ymd;
  }
}

/* ─────────────── icons ─────────────── */

const IconGear = ({ size = 24 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.04 1.56V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.11-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06A2 2 0 1 1 4.13 16.92l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1.04H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.65 8.83a1.7 1.7 0 0 0-.34-1.87l-.06-.06A2 2 0 1 1 7.08 4.07l.06.06a1.7 1.7 0 0 0 1.87.34H9a1.7 1.7 0 0 0 1.04-1.56V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1.04 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06A2 2 0 1 1 19.93 7.08l-.06.06a1.7 1.7 0 0 0-.34 1.87V9c.27.66.93 1.1 1.65 1.1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1z" />
  </svg>
);
const IconChevron = ({ color = "rgba(60,60,67,0.3)" }: { color?: string }) => (
  <svg width="8" height="14" viewBox="0 0 8 14" fill="none" aria-hidden>
    <path d="M1 1l6 6-6 6" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const IconCheckCircle = ({ color, size = 22 }: { color: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden>
    <circle cx="12" cy="12" r="11" />
    <path d="M7 12l3.5 3.5L17 9" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </svg>
);
const IconCircle = ({ color = "#C7C7CC", size = 22 }: { color?: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
    <circle cx="12" cy="12" r="10.5" stroke={color} strokeWidth="1.6" />
  </svg>
);

export default function HomeDashboardPage() {
  const router = useRouter();
  const { user, firebaseUser, loading, refreshUser } = useAuth();
  const { t, locale } = useLanguage();

  // 미래의 나·목표는 홈에서 읽기 전용 — 수정은 /settings 에서. 항상 user 의 최신 값을 반영하도록
  // 별도 state 없이 user 에서 직접 파생한다(설정 화면에서 수정 후 돌아왔을 때 즉시 동기화).
  const goals = user?.goals ?? [];

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

  const [motivation, setMotivation] = useState<DailyMotivation | null>(null);
  const [motivationLoading, setMotivationLoading] = useState(true);
  const [motivationError, setMotivationError] = useState<string | null>(null);
  const ensureRequestedYmdRef = useRef<string | null>(null);
  const [alreadyCheckedInToday, setAlreadyCheckedInToday] = useState(false);

  const [activeTab, setActiveTab] = useState<"future" | "actions">("future");

  useEffect(() => {
    if (loading) return;
    if (!firebaseUser) {
      router.push("/login");
      return;
    }
    if (user && !user.onboardedAt) router.replace("/onboarding");
  }, [firebaseUser, loading, router, user]);

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
      if (!dailyHydratedRef.current) setWins(normalized);
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
      if (!res.ok) throw new Error(data.error || "다시 받기에 실패했어요.");
      if (data.motivation) setMotivation(data.motivation);
      // motivation 의 quote/author/goalsSnapshot 이 바뀌었으므로 위젯도 새 카드를 받아가야 한다.
      // 안 호출하면 다음 정주기 Worker(3시간) 까지 위젯과 홈의 명언이 어긋난다.
      notifyAndroidWidgetRefresh();
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
      if (!res.ok || !data.ok) throw new Error(data.error || "응답을 저장하지 못했어요.");
      // mission response 가 영구화되면 affirmation 진척도가 함께 갱신될 수 있어 위젯도 깨운다.
      notifyAndroidWidgetRefresh();
      return { isFirst: Boolean(data.isFirst), identityTag: data.identityTag || "" };
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
      if (!res.ok || !data.ok) throw new Error(data.error || "체크인을 저장하지 못했어요.");
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
      <div className="flex h-full items-center justify-center bg-[var(--bg-grouped)]">
        <div className="h-6 w-6 animate-spin rounded-full border-[1.5px] border-black/10 border-t-[#D85A30]" />
      </div>
    );
  }

  const uid = firebaseUser.uid;

  /* ───── handlers ───── */

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

  const handleChangeWin = (idx: number, value: string) => {
    const next = wins.map((w, i) => (i === idx ? value.slice(0, WIN_MAX) : w));
    setWins(next);
    if (winsJustSaved) setWinsJustSaved(false);
    if (winsError) setWinsError(null);

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
  const longDate = formatLongDate(ymd, locale);
  const goalsDone = achievedGoals.filter((g) => goals.includes(g)).length;

  /* ───── render ───── */

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-[var(--bg-grouped)] pb-12">
      {/* ── Large Title bar — Apple iOS native pattern ── */}
      <header className="bg-[var(--bg-grouped)] pt-3 pb-2">
        {/* 상단 브랜드 로고 — 앱 진입 직후 가장 먼저 보이는 brand identity.
            indigo Aperture + soul 오렌지 코어 + "anima" 워드마크. lockup SVG 의
            기본 비율(100:30)에 맞춰 height 22 → width 73px 자동 산출. */}
        <div className="mx-auto flex max-w-3xl items-center justify-center px-5 pt-1 pb-2">
          <Logo variant="lockup" tone="light" size={22} alt="Anima" priority />
        </div>
        <div className="mx-auto flex max-w-3xl items-center justify-between px-2 min-h-[44px]">
          <div className="w-[44px]" />
          <div className="flex items-center gap-2">
            {streakCount > 0 && (
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full"
                style={{ background: "rgba(255,149,0,0.16)" }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="#D85A30" aria-hidden>
                  <path d="M13 2L4.5 13.5h6L9 22l8.5-11.5h-6L13 2z" />
                </svg>
                <span className="text-[12px] font-semibold tracking-[0.4px] text-[#D85A30]">
                  {streakCount}
                </span>
              </div>
            )}
            <button
              type="button"
              onClick={() => router.push("/settings")}
              aria-label={t("home.settingsAria")}
              className="w-11 h-11 flex items-center justify-center text-[var(--soul)] hover:opacity-70 transition-opacity"
            >
              <IconGear />
            </button>
          </div>
        </div>
        <div className="mx-auto max-w-3xl px-5">
          <h1 className="text-large-title font-display">{t("home.title")}</h1>
          <p className="text-subhead mt-0.5 text-[var(--label-2)]">{longDate}</p>
        </div>
      </header>

      {/* ── Segmented control ── */}
      <div className="mx-auto w-full max-w-3xl px-4 mt-3">
        <div role="tablist" aria-label={t("home.title")}
          className="flex p-[2px] rounded-[9px]"
          style={{ background: "rgba(118,118,128,0.12)" }}>
          {(["future", "actions"] as const).map((tab) => {
            const selected = activeTab === tab;
            const badge =
              tab === "future"
                ? alreadyCheckedInToday ? " ✓" : ""
                : goals.length > 0 ? ` ${goalsDone}/${goals.length}` : "";
            return (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setActiveTab(tab)}
                className="flex-1 h-7 rounded-[7px] text-[13px] tracking-[-0.08px] transition-colors"
                style={{
                  background: selected ? "#FFFFFF" : "transparent",
                  color: "#000",
                  fontWeight: selected ? 600 : 500,
                  boxShadow: selected
                    ? "0 3px 8px rgba(0,0,0,0.12), 0 1px 1px rgba(0,0,0,0.04), 0 0 0 0.5px rgba(0,0,0,0.04)"
                    : "none",
                }}
              >
                {t(tab === "future" ? "home.tab.future" : "home.tab.actions")}
                {badge && (
                  <span className="ml-1 text-[11px] text-[var(--label-3)]">{badge}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <main className="mx-auto w-full max-w-3xl">
        {/* ─── Tab · 오늘 (future) ─── */}
        {activeTab === "future" && (
          <>
            <div className="px-4 pt-5">
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
            </div>
            {motivationError && motivation && (
              <p className="mx-5 mt-3 text-[13px] text-[#FF3B30]">{motivationError}</p>
            )}
          </>
        )}

        {/* ─── Tab · 나의 행동 (actions) ─── */}
        {activeTab === "actions" && (
          <>
            {/* ── 10년 후의 나 (읽기 전용 — 수정은 /settings) ── */}
            <GroupedSection header={t("home.future.title")}>
              <div className="px-5 py-4">
                {futureText ? (
                  <p className="whitespace-pre-wrap text-[17px] leading-[24px] tracking-[-0.43px] text-[var(--label)]">
                    {futureText}
                  </p>
                ) : (
                  <button
                    type="button"
                    onClick={() => router.push("/settings")}
                    className="block w-full text-left text-[17px] leading-[24px] text-[var(--label-3)]"
                  >
                    {t("home.future.empty")}
                  </button>
                )}
              </div>
            </GroupedSection>

            {/* ── 이번 달 목표 (읽기·달성 토글 전용 — 추가/삭제는 /settings) ── */}
            <GroupedSection
              header={t("home.goals.title")}
              trailing={
                goals.length > 0 ? (
                  <span className="text-[13px] text-[var(--label-2)] tabular-nums">
                    {goalsDone} / {goals.length}
                  </span>
                ) : null
              }
            >
              {goals.length > 0 ? (
                goals.map((goal, idx) => {
                  const trimmed = goal.trim();
                  const achieved =
                    trimmed.length > 0 && achievedGoals.includes(trimmed);
                  const color = SLOT_COLORS[idx % SLOT_COLORS.length];
                  const num = String(idx + 1).padStart(2, "0");
                  const isLast = idx === goals.length - 1;
                  return (
                    <div
                      key={idx}
                      className="relative flex items-center gap-3 px-4 min-h-[60px]"
                    >
                      {/* Colored number badge — tap to toggle achieved */}
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
                        className="w-9 h-9 rounded-[10px] flex items-center justify-center flex-shrink-0 transition-opacity"
                        style={{
                          background: achieved ? color : color + "1A",
                          opacity: trimmed.length === 0 ? 0.4 : 1,
                        }}
                      >
                        {achieved ? (
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M5 12l5 5L20 7" />
                          </svg>
                        ) : (
                          <span
                            className="text-[15px] font-bold tracking-[-0.3px]"
                            style={{ color }}
                          >
                            {num}
                          </span>
                        )}
                      </button>
                      <div className="flex-1 min-w-0 py-2">
                        <div
                          className={`text-[17px] leading-[22px] tracking-[-0.43px] ${
                            achieved ? "text-[var(--label-2)] line-through decoration-[var(--label-3)]" : "text-[var(--label)]"
                          }`}
                        >
                          {trimmed || (
                            <span className="text-[var(--label-3)]">{t("home.goals.placeholder")}</span>
                          )}
                        </div>
                      </div>
                      {!isLast && (
                        <div
                          className="absolute bottom-0 right-0 h-[0.5px]"
                          style={{ left: 60, background: "var(--sep)" }}
                        />
                      )}
                    </div>
                  );
                })
              ) : (
                <button
                  type="button"
                  onClick={() => router.push("/settings")}
                  className="block w-full px-5 py-4 text-left text-[17px] text-[var(--label-3)]"
                >
                  {t("home.goals.subtitle")}
                </button>
              )}
            </GroupedSection>

            {/* ── 오늘의 작은 승리 ── */}
            <GroupedSection
              header={t("home.wins.title", { max: MAX_DAILY_WINS })}
              trailing={
                <div className="flex items-center gap-4">
                  {winsError ? (
                    <span className="text-[13px] text-[#FF3B30]">{winsError}</span>
                  ) : winsJustSaved ? (
                    <span className="text-[13px] font-medium text-[#D85A30]">
                      {t("common.saved")}
                    </span>
                  ) : winsAutoSaving ? (
                    <span className="text-[13px] text-[var(--label-3)]">{t("common.saving")}</span>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => router.push("/wins-history")}
                    className="text-[15px] font-medium text-[var(--soul)]"
                  >
                    {t("home.wins.history")}
                  </button>
                </div>
              }
              footer="자동으로 저장돼요"
            >
              {[0, 1, 2].map((idx) => {
                const num = String(idx + 1).padStart(2, "0");
                const color = SLOT_COLORS[idx % SLOT_COLORS.length];
                const placeholder =
                  idx === 0 ? t("home.wins.placeholder1")
                  : idx === 1 ? t("home.wins.placeholder2")
                  : t("home.wins.placeholder3");
                const isLast = idx === 2;
                return (
                  <div key={idx} className="relative flex items-start gap-3 px-4 py-3">
                    <div className="w-9 h-9 rounded-[10px] flex items-center justify-center flex-shrink-0 mt-0.5"
                      style={{ background: color + "1A" }}>
                      <span className="text-[15px] font-bold tracking-[-0.3px]" style={{ color }}>
                        {num}
                      </span>
                    </div>
                    <textarea
                      value={wins[idx] || ""}
                      rows={1}
                      maxLength={WIN_MAX}
                      onChange={(e) => handleChangeWin(idx, e.target.value)}
                      placeholder={placeholder}
                      className="flex-1 min-h-[24px] resize-none bg-transparent text-[17px] leading-[24px] tracking-[-0.43px] text-[var(--label)] placeholder:text-[var(--label-3)] focus:outline-none py-2"
                    />
                    {!isLast && (
                      <div
                        className="absolute bottom-0 right-0 h-[0.5px]"
                        style={{ left: 60, background: "var(--sep)" }}
                      />
                    )}
                  </div>
                );
              })}
            </GroupedSection>
          </>
        )}
      </main>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
 * GroupedSection — iOS Settings.app's inset card pattern.
 * Header (uppercase, label2) above + footer (label2 footnote) below.
 * Card itself: white bg, 12px radius, 16px side inset.
 * ───────────────────────────────────────────────────────────── */
function GroupedSection({
  header,
  footer,
  trailing,
  children,
}: {
  header?: string;
  footer?: string;
  trailing?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-7">
      {(header || trailing) && (
        <div className="flex items-end justify-between px-7 mb-1.5">
          {header && (
            <span className="text-[13px] uppercase tracking-[-0.08px] text-[var(--label-2)]">
              {header}
            </span>
          )}
          {trailing}
        </div>
      )}
      <div className="mx-4 bg-[var(--bg-grouped-2)] rounded-[12px] overflow-hidden">
        {children}
      </div>
      {footer && (
        <p className="px-7 mt-1.5 text-[13px] tracking-[-0.08px] text-[var(--label-2)]">
          {footer}
        </p>
      )}
    </div>
  );
}
