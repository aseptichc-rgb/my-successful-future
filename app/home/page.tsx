"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import {
  onDailyEntrySnapshot,
  onDailyMotivationSnapshot,
  onFutureVisionSnapshot,
  onAffirmationCheckinSnapshot,
  onExecutionPlansSnapshot,
  saveDailyWins,
  saveDailyAchievedGoals,
  saveTomorrowFirstAction,
  getDailyEntryOnce,
  getAffirmationLogYmds,
  getIdentityEvidenceRange,
  getDailyWinsHistory,
  getKstYmd,
  MAX_DAILY_WINS,
  TOMORROW_FIRST_ACTION_MAX,
  type ExecutionPlanWithId,
} from "@/lib/firebase";
import { kstHour, kstWeekday, yesterdayKstYmd, addKstDays } from "@/lib/kstDate";
import { pickTodayPlan, pickTodayAffirmationIndex } from "@/lib/planRotation";
import {
  buildWeeklyReview,
  weeklyReviewFrom,
  WEEKLY_REVIEW_DAYS,
  type WeeklyReview,
} from "@/lib/weeklyReview";
import { authedFetch } from "@/lib/authedFetch";
import { notifyAndroidWidgetRefresh } from "@/lib/widgetBridge";
import { refreshIosWidget } from "@/lib/iosWidget";
import MotivationCard from "@/components/home/MotivationCard";
import FutureVisionCard from "@/components/home/FutureVisionCard";
import DailyPlanCard from "@/components/home/DailyPlanCard";
import RecommitCard from "@/components/home/RecommitCard";
import CheckinReward from "@/components/home/CheckinReward";
import WeekRhythmRing from "@/components/home/WeekRhythmRing";
import WeeklyReviewCard from "@/components/home/WeeklyReviewCard";
import AffirmationCheckin, {
  type CheckinSubmitResult,
} from "@/components/affirmations/AffirmationCheckin";
import Logo from "@/components/ui/Logo";
import DisclosureSection from "@/components/ui/DisclosureSection";
import { useLanguage } from "@/lib/i18n";
import type { DailyEntry, DailyMotivation, FutureVision } from "@/types";

/* ─────────────────────────────────────────────────────────────────
 * Anima Home — "오늘 1가지 + 접기"
 * ─────────────────────────────────────────────────────────────────
 *  하루에 요구하는 필수 입력은 **다짐 1줄 전사 1건**뿐이다. 나머지(목표 토글·
 *  작은 승리·내일 첫 행동)는 전부 기본 접힘의 선택 섹션으로 내렸다.
 *
 *  ⚠️ 섹션 순서는 절대 고정이다 — 시간대에 따라 카드를 재배치하면 같은 버튼이
 *  매일 다른 자리에 오고, 습관이 학습하는 위치 단서(context cue)가 깨진다.
 *  homeMode 는 "무엇을 보여줄지"만 정하고 "어디에 둘지"는 절대 정하지 않는다.
 *
 *  고정 순서: 명언 → 오늘의 다짐(필수) → 7일 리듬 → [주간 회고] →
 *            ▸오늘의 실행(접힘) → ▸오늘의 기록(접힘)
 *
 *  · Large Title nav · Grouped Inset Lists · 오렌지 스트릭 칩(→ /progress)
 *  · 600ms debounce auto-save for wins · no save button
 * ────────────────────────────────────────────────────────────────── */

const WIN_MAX = 140;
const WINS_AUTOSAVE_MS = 600;
const WINS_SAVED_TOAST_MS = 1800;
const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;
/** 잘한 일은 1칸만 펼쳐두고 나머지는 "한 줄 더"로 — 빈 칸 3개는 숙제처럼 읽힌다. */
const WINS_INITIAL_VISIBLE = 1;

/**
 * 아침/저녁 2모드 경계 (KST 시각). **내용 선택에만** 쓴다(배치는 불변):
 * 아침(<12): "오늘의 if-then" 을 펼쳐 보여준다(compact=false).
 * 저녁(>=18): 기록 섹션에 "내일 첫 행동 1개" 를 추가하고, 일요일이면 주간 회고를 띈다.
 * 사이(12~17): 중립.
 */
const MORNING_END_HOUR = 12;
const EVENING_START_HOUR = 18;
/** 주간 회고를 띄우는 요일 (0=일요일) — 한 주를 닫는 시점. */
const WEEKLY_REVIEW_WEEKDAY = 0;
type HomeMode = "morning" | "neutral" | "evening";

function currentHomeMode(): HomeMode {
  const h = kstHour();
  return h < MORNING_END_HOUR ? "morning" : h >= EVENING_START_HOUR ? "evening" : "neutral";
}

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

  // "내일 첫 행동 1개" (저녁 모드) — wins 와 동일한 600ms 디바운스 자동 저장 패턴.
  const [tomorrowAction, setTomorrowAction] = useState("");
  const [savedTomorrowAction, setSavedTomorrowAction] = useState("");
  const [tomorrowSaving, setTomorrowSaving] = useState(false);
  const [tomorrowJustSaved, setTomorrowJustSaved] = useState(false);
  const [tomorrowError, setTomorrowError] = useState<string | null>(null);
  const tomorrowAutosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tomorrowToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // WOOP 실행설계 목록 + 아침 카드의 "어젯밤의 내가 정한 첫 행동".
  const [plans, setPlans] = useState<ExecutionPlanWithId[]>([]);
  const [yesterdayFirstAction, setYesterdayFirstAction] = useState<string | null>(null);

  // 잘한 일 — 빈 칸을 몇 개 펼칠지. 저장 구조(3-slot 배열)는 그대로다.
  const [winsVisible, setWinsVisible] = useState(WINS_INITIAL_VISIBLE);

  // 7일 리듬 링 — 최근 7일 체크인 날짜. null = 아직 로딩(또는 실패 → 링 생략).
  const [weekCheckedYmds, setWeekCheckedYmds] = useState<Set<string> | null>(null);
  // 체크인 직후 보상 — 이번 세션에서 방금 체크인했을 때만 채워진다.
  const [reward, setReward] = useState<CheckinSubmitResult | null>(null);
  // 주간 회고 (일요일 저녁) — 실패하면 null 로 두고 카드만 생략한다.
  const [weeklyReview, setWeeklyReview] = useState<WeeklyReview | null>(null);

  useEffect(() => {
    return () => {
      if (winsSavedToastTimerRef.current) clearTimeout(winsSavedToastTimerRef.current);
      if (winsAutosaveTimerRef.current) clearTimeout(winsAutosaveTimerRef.current);
      if (tomorrowAutosaveTimerRef.current) clearTimeout(tomorrowAutosaveTimerRef.current);
      if (tomorrowToastTimerRef.current) clearTimeout(tomorrowToastTimerRef.current);
    };
  }, []);

  const [motivation, setMotivation] = useState<DailyMotivation | null>(null);
  const [motivationLoading, setMotivationLoading] = useState(true);
  const [motivationError, setMotivationError] = useState<string | null>(null);
  const ensureRequestedYmdRef = useRef<string | null>(null);
  const [alreadyCheckedInToday, setAlreadyCheckedInToday] = useState(false);

  const [vision, setVision] = useState<FutureVision | null>(null);
  const [visionLoading, setVisionLoading] = useState(true);
  const [visionError, setVisionError] = useState<string | null>(null);
  const ensureRequestedVisionYmdRef = useRef<string | null>(null);

  // 시간대 모드는 "무엇을 보여줄지"만 정한다 — 섹션 순서는 절대 바뀌지 않는다.
  // (렌더마다 재계산해 화면을 열어둔 채 시간 경계를 넘겨도 다음 렌더에 반영된다.)
  const homeMode = currentHomeMode();

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
    // 날짜(ymd)·계정이 바뀌면 새 문서로 다시 hydrate 해야 하므로 플래그를 리셋한다.
    // (리셋하지 않으면 자정 롤오버 시 전날 wins 가 오늘 화면에 남고, 한 글자만 입력해도
    //  전날 기록이 오늘 문서로 자동 저장되는 데이터 오염이 발생.)
    dailyHydratedRef.current = false;
    const unsub = onDailyEntrySnapshot(firebaseUser.uid, ymd, (entry: DailyEntry | null) => {
      if (!entry) {
        if (!dailyHydratedRef.current) {
          setWins(["", "", ""]);
          setSavedWins(["", "", ""]);
          setAchievedGoals([]);
          setTomorrowAction("");
          setSavedTomorrowAction("");
          dailyHydratedRef.current = true;
        }
        return;
      }
      const w = Array.isArray(entry.wins) ? entry.wins : [];
      const normalized = [0, 1, 2].map((i) => w[i] || "");
      const tfa = typeof entry.tomorrowFirstAction === "string" ? entry.tomorrowFirstAction : "";
      if (!dailyHydratedRef.current) {
        setWins(normalized);
        setTomorrowAction(tfa);
      }
      setSavedWins(normalized);
      setSavedTomorrowAction(tfa);
      setAchievedGoals(Array.isArray(entry.achievedGoals) ? entry.achievedGoals : []);
      dailyHydratedRef.current = true;
    });
    return unsub;
  }, [firebaseUser, ymd]);

  // WOOP 실행설계 목록 구독 — "오늘의 if-then" 회전 + 실행 설계 섹션 공용.
  useEffect(() => {
    if (!firebaseUser) return;
    const unsub = onExecutionPlansSnapshot(firebaseUser.uid, setPlans, () => {
      // 구독 실패(규칙 미배포 등) 시 섹션만 비운다 — 홈 나머지는 정상 동작.
      setPlans([]);
    });
    return unsub;
  }, [firebaseUser]);

  // 어제 저녁에 적은 "내일 첫 행동" — 아침 카드 보조 행. 실패해도 카드만 생략.
  useEffect(() => {
    if (!firebaseUser) return;
    let cancelled = false;
    getDailyEntryOnce(firebaseUser.uid, yesterdayKstYmd(ymd))
      .then((entry) => {
        if (cancelled) return;
        const txt = (entry?.tomorrowFirstAction ?? "").trim();
        setYesterdayFirstAction(txt.length > 0 ? txt : null);
      })
      .catch((err) => {
        console.error("[home] 어제 첫 행동 조회 실패(생략):", err);
        if (!cancelled) setYesterdayFirstAction(null);
      });
    return () => {
      cancelled = true;
    };
  }, [firebaseUser, ymd]);

  useEffect(() => {
    if (!firebaseUser) return;
    setMotivationLoading(true);
    let cancelled = false;
    const unsub = onDailyMotivationSnapshot(
      firebaseUser.uid,
      ymd,
      (m) => {
        if (cancelled) return;
        setMotivation(m);
        setMotivationLoading(false);
        if (m) setMotivationError(null);
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
      },
      // 구독 실패(권한/네트워크) 시 스켈레톤에 갇히지 않도록 로딩을 풀고 에러를 표시한다.
      () => {
        if (cancelled) return;
        setMotivationLoading(false);
        setMotivationError("동기부여 카드를 불러오지 못했어요.");
      },
    );
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
      void refreshIosWidget();
    } catch (err) {
      setMotivationError(err instanceof Error ? err.message : String(err));
    }
  }, [ymd]);

  // ── 미래 일상 비전: 구독 + 캐시 미스 시 자동 생성 (동기부여 카드와 동일 패턴) ──
  // futurePersona 가 비어 있으면 빈 비전을 만들지 않고 CTA 만 보여준다(서버 호출 생략).
  useEffect(() => {
    if (!firebaseUser) return;
    const personaWritten = Boolean((user?.futurePersona ?? "").trim());
    setVisionLoading(true);
    let cancelled = false;
    const unsub = onFutureVisionSnapshot(
      firebaseUser.uid,
      ymd,
      (v) => {
      if (cancelled) return;
      setVision(v);
      setVisionLoading(false);
      // 새 비전이 도착하면(스냅샷/재생성 성공) 직전 재생성 오류 메시지는 더 이상 유효하지 않다.
      if (v) setVisionError(null);
      if (!v && personaWritten && ensureRequestedVisionYmdRef.current !== ymd) {
        ensureRequestedVisionYmdRef.current = ymd;
        authedFetch("/api/future-vision", {
          method: "POST",
          body: JSON.stringify({ ymd }),
        })
          .then(async (res) => {
            if (!res.ok) {
              const data = await res.json().catch(() => ({}));
              throw new Error((data as { error?: string }).error || "미래 일상을 만들지 못했어요.");
            }
            // 첫 생성으로 오늘 비전 문서가 생겼으니 위젯도 같은 하루를 받도록 깨운다.
            notifyAndroidWidgetRefresh();
            void refreshIosWidget();
          })
          .catch((err) => {
            if (cancelled) return;
            setVisionError(err instanceof Error ? err.message : String(err));
          });
      }
      },
      (err) => {
        // 구독 자체가 실패(예: 규칙 미배포로 read 거부)하면 스켈레톤에 갇히지 않도록
        // 로딩을 풀고 오류 문구를 노출한다.
        if (cancelled) return;
        setVisionLoading(false);
        setVisionError(err instanceof Error ? err.message : t("futureVision.error"));
      },
    );
    return () => {
      cancelled = true;
      unsub();
    };
  }, [firebaseUser, ymd, user?.futurePersona, t]);

  const handleRegenerateFutureVision = useCallback(async () => {
    setVisionError(null);
    try {
      const res = await authedFetch("/api/future-vision", {
        method: "POST",
        body: JSON.stringify({ ymd, force: true }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        vision?: FutureVision;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || "또 다른 하루를 그리지 못했어요.");
      if (data.vision) setVision(data.vision);
      // 재생성으로 오늘 비전 문서가 바뀌었으니 위젯도 깨워 같은 하루를 보게 한다
      //  (동기부여 카드 재생성과 동일 — 안 하면 위젯이 옛 비전을 들고 있어 앱과 불일치).
      notifyAndroidWidgetRefresh();
      void refreshIosWidget();
    } catch (err) {
      setVisionError(err instanceof Error ? err.message : String(err));
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
      void refreshIosWidget();
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

  /* ── 재약속 카드의 "지금 체크인하기" CTA ──
   * 체크인 카드는 이제 항상 같은 자리(고정 순서 ②)에 있으므로 탭 전환이 필요 없다.
   * nonce 를 올려 매 클릭마다 이펙트를 재실행하고, 카드로 스크롤 + 첫 입력칸 포커스를 수행한다.
   * (setState 동일값은 no-op 이라 nonce 없이는 두 번째 클릭이 아무 일도 하지 않는다.) */
  const checkinAnchorRef = useRef<HTMLDivElement | null>(null);
  const [checkinCtaNonce, setCheckinCtaNonce] = useState(0);

  const handleCheckinCta = useCallback(() => {
    setCheckinCtaNonce((n) => n + 1);
  }, []);

  useEffect(() => {
    if (checkinCtaNonce === 0) return; // 최초 마운트에는 동작하지 않는다
    // 렌더가 끝나 카드가 DOM 에 붙은 뒤에 스크롤해야 위치가 정확하다.
    const raf = requestAnimationFrame(() => {
      const el = checkinAnchorRef.current;
      if (!el) return;
      try {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        // 다짐이 없어 체크인 카드가 없을 수 있다 — 포커스는 best-effort.
        el.querySelector<HTMLInputElement>("input:not([disabled])")?.focus({ preventScroll: true });
      } catch {
        /* smooth 스크롤 미지원 구형 웹뷰 — 카드는 이미 화면에 있다 */
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [checkinCtaNonce]);

  /* ── 7일 리듬 링 데이터 ──
   * 기존 /progress 조회 함수(getAffirmationLogYmds)를 재사용한다 — 신규 쿼리 없음.
   * 체크인 성공(alreadyCheckedInToday 전이)마다 다시 읽어 오늘 칸이 즉시 채워진다.
   * 실패해도 링만 생략하고 홈 나머지는 정상 동작한다. */
  useEffect(() => {
    if (!firebaseUser) return;
    let cancelled = false;
    getAffirmationLogYmds(firebaseUser.uid, addKstDays(ymd, -(WEEKLY_REVIEW_DAYS - 1)), ymd)
      .then((ymds) => {
        if (!cancelled) setWeekCheckedYmds(new Set(ymds));
      })
      .catch((err) => {
        console.error("[home] 주간 리듬 조회 실패(링 생략):", err);
        if (!cancelled) setWeekCheckedYmds(null);
      });
    return () => {
      cancelled = true;
    };
  }, [firebaseUser, ymd, alreadyCheckedInToday]);

  /* ── 주간 회고 (일요일 저녁만) ──
   * 세 조회 모두 기존 함수 재사용. 집계는 lib/weeklyReview 순수 함수가 담당한다.
   * 조건을 만족하지 않으면 호출 자체를 하지 않아 평일엔 비용이 0이다. */
  const showWeeklyReview =
    homeMode === "evening" && kstWeekday(ymd) === WEEKLY_REVIEW_WEEKDAY;

  useEffect(() => {
    // 조건을 만족하지 않으면 조회하지 않는다(평일 비용 0). 남아 있는 이전 값은
    // 렌더가 showWeeklyReview 로 게이팅하므로 굳이 지우지 않는다 — 불필요한 재렌더 방지.
    if (!firebaseUser || !showWeeklyReview) return;
    let cancelled = false;
    const from = weeklyReviewFrom(ymd);
    void (async () => {
      try {
        const [checkinYmds, evidenceDays, winsHistory] = await Promise.all([
          getAffirmationLogYmds(firebaseUser.uid, from, ymd),
          getIdentityEvidenceRange(firebaseUser.uid, from, ymd),
          getDailyWinsHistory(firebaseUser.uid, WEEKLY_REVIEW_DAYS),
        ]);
        if (cancelled) return;
        setWeeklyReview(
          buildWeeklyReview({ checkinYmds, evidenceDays, winsHistory, toYmd: ymd }),
        );
      } catch (err) {
        console.error("[home] 주간 회고 조회 실패(카드 생략):", err);
        if (!cancelled) setWeeklyReview(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [firebaseUser, ymd, showWeeklyReview, alreadyCheckedInToday]);

  // iOS 홈/잠금화면 위젯: 홈 진입 시 오늘 카드를 한 번 받아 위젯 공유 캐시에 공급한다.
  // 위젯 익스텐션은 스스로 인증 호출을 못 하므로 앱이 데이터를 밀어 넣는다. 웹/안드로이드는 no-op.
  useEffect(() => {
    if (!firebaseUser) return;
    void refreshIosWidget();
  }, [firebaseUser, ymd]);

  const handleAffirmationCheckin = useCallback(
    async (entries: Array<{ index: number; text: string }>): Promise<CheckinSubmitResult> => {
      const res = await authedFetch("/api/affirmation-checkin", {
        method: "POST",
        body: JSON.stringify({ ymd, entries }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        matched?: boolean;
        streakCount?: number;
        mismatchedIndices?: number[];
        focusIndex?: number;
        depth?: "focus" | "full";
        evidenceVotes?: number;
        evidenceTag?: string;
        freezeUsed?: number;
        error?: string;
      };
      if (!res.ok || !data.ok) throw new Error(data.error || "체크인을 저장하지 못했어요.");
      if (data.matched) {
        await refreshUser().catch(() => {});
        notifyAndroidWidgetRefresh();
        void refreshIosWidget();
      }
      return {
        matched: Boolean(data.matched),
        streakCount: Number(data.streakCount ?? 0),
        mismatchedIndices: data.mismatchedIndices,
        focusIndex: data.focusIndex,
        depth: data.depth,
        evidenceVotes: data.evidenceVotes,
        evidenceTag: data.evidenceTag,
        freezeUsed: data.freezeUsed,
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
      void refreshIosWidget();
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
      void refreshIosWidget();
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

  // ── "내일 첫 행동 1개" — wins 와 동일한 디바운스 자동 저장 패턴 ──
  const handleChangeTomorrowAction = (value: string) => {
    const next = value.slice(0, TOMORROW_FIRST_ACTION_MAX);
    setTomorrowAction(next);
    if (tomorrowJustSaved) setTomorrowJustSaved(false);
    if (tomorrowError) setTomorrowError(null);

    if (tomorrowAutosaveTimerRef.current) clearTimeout(tomorrowAutosaveTimerRef.current);
    const dirty = next !== savedTomorrowAction;
    if (!dirty || next.trim().length === 0) return;
    tomorrowAutosaveTimerRef.current = setTimeout(() => {
      void doAutoSaveTomorrowAction(next);
    }, WINS_AUTOSAVE_MS);
  };

  const doAutoSaveTomorrowAction = async (snapshot: string) => {
    setTomorrowSaving(true);
    setTomorrowError(null);
    try {
      await saveTomorrowFirstAction(uid, ymd, snapshot);
      setSavedTomorrowAction(snapshot);
      setTomorrowJustSaved(true);
      if (tomorrowToastTimerRef.current) clearTimeout(tomorrowToastTimerRef.current);
      tomorrowToastTimerRef.current = setTimeout(
        () => setTomorrowJustSaved(false),
        WINS_SAVED_TOAST_MS,
      );
    } catch (err) {
      console.error("[home] 내일 첫 행동 자동 저장 실패:", err);
      setTomorrowError(t("home.wins.saveFailed"));
    } finally {
      setTomorrowSaving(false);
    }
  };

  const futureText = user?.futurePersona || "";
  const streakCount = user?.affirmationStreak?.count ?? 0;
  const longDate = formatLongDate(ymd, locale);
  const goalsDone = achievedGoals.filter((g) => goals.includes(g)).length;
  // 오늘의 if-then — 홈과 위젯이 같은 순수 회전(lib/planRotation)을 써 항상 일치한다.
  const todayPlan = pickTodayPlan(plans, uid, ymd);

  const affirmations = user?.successAffirmations ?? [];
  // 오늘 새길 다짐 — 서버 체크인 트랜잭션과 같은 순수 함수를 공유하므로 판정이 어긋나지 않는다.
  const todayFocusIndex = pickTodayAffirmationIndex(uid, ymd, affirmations.length);

  // 여정을 시작한 날(KST) — 리듬 링의 사전 적립 칸. Timestamp 형태가 깨져 있으면 생략한다.
  const onboardedYmd = (() => {
    const raw = user?.onboardedAt as { toDate?: () => Date } | undefined;
    if (!raw?.toDate) return null;
    try {
      return getKstYmd(raw.toDate());
    } catch {
      return null;
    }
  })();

  // 이미 적어둔 잘한 일은 접지 않는다 — 별도 state 동기화 없이 렌더 시점에 파생한다.
  const winsFilled = wins.filter((w) => (w || "").trim().length > 0).length;
  const winRowCount = Math.min(MAX_DAILY_WINS, Math.max(winsVisible, winsFilled));

  // 접힌 섹션 요약 — 안에 무엇이 있는지 열지 않고도 알 수 있게 한다.
  const todaySummary =
    goals.length > 0 ? `${goalsDone} / ${goals.length}` : todayPlan ? "⚡" : "";
  const recordSummary =
    winsFilled > 0 ? t("weekly.wins", { count: winsFilled }) : "";

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
            {/* 스트릭 칩 — 탭하면 /progress (히트맵·최고기록·정체성 장부) 로 이동 */}
            <button
              type="button"
              onClick={() => router.push("/progress")}
              aria-label={t("progress.chipAria")}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full hover:opacity-80 transition-opacity"
              style={{ background: "rgba(255,149,0,0.16)" }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="#D85A30" aria-hidden>
                <path d="M13 2L4.5 13.5h6L9 22l8.5-11.5h-6L13 2z" />
              </svg>
              <span className="text-[12px] font-semibold tracking-[0.4px] text-[#D85A30]">
                {streakCount}
              </span>
            </button>
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

      {/* 세그먼티드 2탭은 제거했다 — 하루의 필수 행동이 탭 뒤에 숨으면 안 되고,
          탭 상태에 따라 카드 위치가 바뀌면 습관의 위치 단서가 깨진다. */}

      <main className="mx-auto w-full max-w-3xl">
        {/* ── 스트릭 공백 감지 — 프리즈 안내 칩 / 자기연민 재약속 카드 ── */}
        <RecommitCard
          streak={user?.affirmationStreak}
          todayYmd={ymd}
          alreadyCheckedInToday={alreadyCheckedInToday}
          onCheckinCta={handleCheckinCta}
        />

        {/* ─── ① 오늘의 한마디 (명언 hero) ─── */}
        <div className="px-4 pt-4">
          <MotivationCard
            motivation={motivation}
            loading={motivationLoading}
            errorMessage={motivationError}
            onRegenerate={handleRegenerateMotivation}
            onSubmitResponse={handleSubmitMissionResponse}
            hasAffirmations={affirmations.length > 0}
          />
        </div>
        {motivationError && motivation && (
          <p className="mx-5 mt-3 text-[13px] text-[#FF3B30]">{motivationError}</p>
        )}

        {/* ─── ② 오늘의 다짐 — 하루의 유일한 필수 행동 ───
            체크인 성공 후에는 같은 자리에 보상 카드를 띄운다(행동 → 보상 거리 0). */}
        {affirmations.length > 0 && (
          <div className="px-4 pt-5" ref={checkinAnchorRef}>
            {reward ? (
              <CheckinReward
                streakCount={reward.streakCount}
                depth={reward.depth}
                evidenceVotes={reward.evidenceVotes}
                evidenceTag={reward.evidenceTag}
                freezeUsed={reward.freezeUsed}
                extraMismatchCount={reward.mismatchedIndices?.length ?? 0}
              />
            ) : (
              <AffirmationCheckin
                affirmations={affirmations}
                focusIndex={todayFocusIndex}
                streakCount={streakCount}
                alreadyCheckedIn={alreadyCheckedInToday}
                onSubmit={handleAffirmationCheckin}
                onCheckedIn={setReward}
              />
            )}
          </div>
        )}

        {/* ─── ③ 7일 리듬 링 — 무한 카운터 대신 손에 닿는 분모 ───
            다짐이 없으면 체크인할 행동 자체가 없다 — 0/7 링은 의미 없는 잔소리가 되므로 숨긴다. */}
        {affirmations.length > 0 && weekCheckedYmds && (
          <div className="px-4 pt-4">
            <WeekRhythmRing
              todayYmd={ymd}
              checkedYmds={weekCheckedYmds}
              startedYmd={onboardedYmd}
            />
          </div>
        )}

        {/* ─── ④ 주간 회고 — 일요일 저녁만, 입력 요구 0 ─── */}
        {showWeeklyReview && weeklyReview && (
          <div className="px-4 pt-4">
            <WeeklyReviewCard review={weeklyReview} />
          </div>
        )}

        {/* ─── ⑤ 미래 일상 비전 (읽기 전용) ─── */}
        <div className="px-4 pt-5">
          <FutureVisionCard
            vision={vision}
            loading={visionLoading}
            errorMessage={visionError}
            onRegenerate={handleRegenerateFutureVision}
            hasFuturePersona={futureText.trim().length > 0}
            onWriteFuturePersona={() => router.push("/settings")}
          />
        </div>

        {/* ─── ⑥ 오늘의 실행 (기본 접힘) — 읽기 + 탭만, 자유입력 없음 ─── */}
        {(plans.length > 0 || goals.length > 0) && (
          <DisclosureSection
            id="home.today"
            header={t("home.section.today")}
            summary={todaySummary}
          >
            {/* 오늘의 if-then — 아침엔 전체, 그 외엔 한 줄 축약.
                DailyPlanCard 가 자체 카드(같은 bg)라 감싸지 않고 flush 로 두면 한 섹션처럼 이어진다. */}
            <div className="border-b border-[var(--sep)]">
              <DailyPlanCard
                plan={todayPlan}
                yesterdayFirstAction={homeMode === "morning" ? yesterdayFirstAction : null}
                compact={homeMode !== "morning"}
                onCreateCta={() => router.push("/settings")}
              />
            </div>

            {/* 이번 달 목표 — 배지를 탭해 달성 토글(추가/삭제는 /settings) */}
            {goals.map((goal, idx) => {
              const trimmed = goal.trim();
              const achieved = trimmed.length > 0 && achievedGoals.includes(trimmed);
              const color = SLOT_COLORS[idx % SLOT_COLORS.length];
              const num = String(idx + 1).padStart(2, "0");
              return (
                <div key={idx} className="relative flex items-center gap-3 px-4 min-h-[60px]">
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
                      <span className="text-[15px] font-bold tracking-[-0.3px]" style={{ color }}>
                        {num}
                      </span>
                    )}
                  </button>
                  <div className="flex-1 min-w-0 py-2">
                    <div
                      className={`text-[17px] leading-[22px] tracking-[-0.43px] ${
                        achieved
                          ? "text-[var(--label-2)] line-through decoration-[var(--label-3)]"
                          : "text-[var(--label)]"
                      }`}
                    >
                      {trimmed || (
                        <span className="text-[var(--label-3)]">{t("home.goals.placeholder")}</span>
                      )}
                    </div>
                  </div>
                  <div
                    className="absolute bottom-0 right-0 h-[0.5px]"
                    style={{ left: 60, background: "var(--sep)" }}
                  />
                </div>
              );
            })}

            {/* 실행 설계 관리 — 홈은 읽기 전용, 편집은 설정에서 (홈의 자유입력 진입점 0) */}
            <button
              type="button"
              onClick={() => router.push("/settings")}
              className="w-full flex items-center gap-3 px-4 py-3 text-left"
            >
              <span className="w-9 flex-shrink-0 text-center text-[15px]" aria-hidden>
                ⚡
              </span>
              <span className="flex-1 text-[15px] leading-[20px] font-medium text-[var(--soul)]">
                {t("home.plans.manage")}
              </span>
              <IconChevron />
            </button>
          </DisclosureSection>
        )}

        {/* ─── ⑦ 오늘의 기록 (기본 접힘) — 전부 선택 입력 ─── */}
        <DisclosureSection
          id="home.record"
          header={t("home.section.record")}
          summary={recordSummary}
          /* "밤새 걱정이 줄어요" 는 내일 첫 행동 칸이 실제로 있는 저녁에만 맞는 문구다. */
          footer={
            homeMode === "evening"
              ? t("home.evening.firstAction.footer")
              : t("home.record.footer")
          }
        >
          {/* 작은 승리 — 처음엔 1칸만, "한 줄 더"로 늘린다(빈 칸 3개는 숙제처럼 읽힌다) */}
          <div className="flex items-center justify-between px-4 pt-3 pb-1">
            <span className="text-[13px] uppercase tracking-[-0.08px] text-[var(--label-2)]">
              {t("home.wins.title", { max: MAX_DAILY_WINS })}
            </span>
            <div className="flex items-center gap-4">
              {winsError ? (
                <span className="text-[13px] text-[#FF3B30]">{winsError}</span>
              ) : winsJustSaved ? (
                <span className="text-[13px] font-medium text-[#D85A30]">{t("common.saved")}</span>
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
          </div>

          {Array.from({ length: winRowCount }, (_, idx) => {
            const num = String(idx + 1).padStart(2, "0");
            const color = SLOT_COLORS[idx % SLOT_COLORS.length];
            const placeholder =
              idx === 0
                ? t("home.wins.placeholder1")
                : idx === 1
                  ? t("home.wins.placeholder2")
                  : t("home.wins.placeholder3");
            return (
              <div key={idx} className="relative flex items-start gap-3 px-4 py-3">
                <div
                  className="w-9 h-9 rounded-[10px] flex items-center justify-center flex-shrink-0 mt-0.5"
                  style={{ background: color + "1A" }}
                >
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
                <div
                  className="absolute bottom-0 right-0 h-[0.5px]"
                  style={{ left: 60, background: "var(--sep)" }}
                />
              </div>
            );
          })}

          {winRowCount < MAX_DAILY_WINS && (
            <button
              type="button"
              onClick={() => setWinsVisible((n) => Math.min(MAX_DAILY_WINS, n + 1))}
              className="w-full flex items-center gap-3 px-4 py-3 text-left"
            >
              <span className="w-9 flex-shrink-0 text-center text-[17px] text-[var(--soul)]" aria-hidden>
                ＋
              </span>
              <span className="flex-1 text-[15px] leading-[20px] font-medium text-[var(--soul)]">
                {t("home.wins.addRow")}
              </span>
            </button>
          )}

          {/* 내일 첫 행동 1개 — 저녁에만 나타난다(위치는 항상 기록 섹션 마지막) */}
          {homeMode === "evening" && (
            <div className="relative flex items-start gap-3 px-4 py-3 border-t border-[var(--sep)]">
              <div
                className="w-9 h-9 rounded-[10px] flex items-center justify-center flex-shrink-0 mt-0.5"
                style={{ background: "rgba(216,90,48,0.12)" }}
              >
                <span className="text-[15px]" aria-hidden>
                  🌅
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[13px] font-medium text-[var(--label-2)]">
                    {t("home.evening.firstAction.title")}
                  </span>
                  {tomorrowError ? (
                    <span className="text-[13px] text-[#FF3B30]">{tomorrowError}</span>
                  ) : tomorrowJustSaved ? (
                    <span className="text-[13px] font-medium text-[#D85A30]">
                      {t("common.saved")}
                    </span>
                  ) : tomorrowSaving ? (
                    <span className="text-[13px] text-[var(--label-3)]">{t("common.saving")}</span>
                  ) : null}
                </div>
                <textarea
                  value={tomorrowAction}
                  rows={1}
                  maxLength={TOMORROW_FIRST_ACTION_MAX}
                  onChange={(e) => handleChangeTomorrowAction(e.target.value)}
                  placeholder={t("home.evening.firstAction.placeholder")}
                  className="mt-1 w-full min-h-[24px] resize-none bg-transparent text-[17px] leading-[24px] tracking-[-0.43px] text-[var(--label)] placeholder:text-[var(--label-3)] focus:outline-none"
                />
              </div>
            </div>
          )}
        </DisclosureSection>
      </main>
    </div>
  );
}

