"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import {
  onDailyEntrySnapshot,
  onDailyMotivationSnapshot,
  onFutureVisionSnapshot,
  onAffirmationCheckinSnapshot,
  saveDailyAchievedGoals,
  getDailyEntryOnce,
  getAffirmationLogYmds,
  getIdentityEvidenceRange,
  getDailyWinsHistory,
  markWinsUnlocked,
  getKstYmd,
} from "@/lib/firebase";
import { useExecutionPlans } from "@/lib/useExecutionPlans";
import { kstWeekday, yesterdayKstYmd, addKstDays } from "@/lib/kstDate";
import { currentHomeMode, WEEKLY_REVIEW_WEEKDAY } from "@/lib/homeMode";
import { pickTodayPlan, pickTodayAffirmationIndex } from "@/lib/planRotation";
import { computeGoalSlots } from "@/lib/goalSlots";
import { computePlanUnlock } from "@/lib/planUnlock";
import { computeWinsUnlock, hasAnyWin } from "@/lib/winsUnlock";
import { growthStageOf } from "@/lib/growthStage";
import { suggestStepUp } from "@/lib/goalStepUp";
import {
  buildWeeklyReview,
  weeklyReviewFrom,
  WEEKLY_REVIEW_DAYS,
  type WeeklyReview,
} from "@/lib/weeklyReview";
import { authedFetch } from "@/lib/authedFetch";
import { isPaymentRequired } from "@/lib/paymentRequired";
import { notifyAndroidWidgetRefresh } from "@/lib/widgetBridge";
import { refreshIosWidget } from "@/lib/iosWidget";
import { isIosNotificationAvailable, syncIosNotifications } from "@/lib/notificationBridge";
import { buildNotificationTexts, normalizeNotificationPrefs } from "@/lib/notificationPolicy";
import { fetchNotificationContent, type NotificationServerContent } from "@/lib/notificationSync";
import MotivationCard from "@/components/home/MotivationCard";
import TodayCard from "@/components/home/TodayCard";
import FutureVisionCard from "@/components/home/FutureVisionCard";
import MoreSection from "@/components/home/MoreSection";
import TrialBanner from "@/components/home/TrialBanner";
import SlotUnlockBanner from "@/components/home/SlotUnlockBanner";
import StepUpCard from "@/components/home/StepUpCard";
import RecommitCard from "@/components/home/RecommitCard";
import DeclarationNudgeCard from "@/components/home/DeclarationNudgeCard";
import WeekRhythmRing from "@/components/home/WeekRhythmRing";
import type { CheckinSubmitResult } from "@/components/affirmations/AffirmationCheckin";
import Logo from "@/components/ui/Logo";
import BootSplash from "@/components/ui/BootSplash";
import { useLanguage } from "@/lib/i18n";
import type { DailyEntry, DailyMotivation, FutureVision } from "@/types";

/* ─────────────────────────────────────────────────────────────────
 * Anima Home — "오늘 하나 + 더 보기"
 * ─────────────────────────────────────────────────────────────────
 *  홈에 상시 노출되는 블록은 셋뿐이다:
 *    ① 오늘의 한마디(명언) → ② 오늘 카드(다짐 1줄 전사 + 목표 실행 체크) → ③ 7일 리듬 링
 *  나머지(내 꿈 · 꿈이 이뤄진 하루 · 실행 설계 · 기록 · 주간 회고)는 전부
 *  ▸더 보기 한 섹션 뒤로 접었다 — "입력이 많고 복잡하다"는 피드백에 대한 답.
 *
 *  ⚠️ 섹션 순서는 절대 고정이다 — 시간대에 따라 카드를 재배치하면 같은 버튼이
 *  매일 다른 자리에 오고, 습관이 학습하는 위치 단서(context cue)가 깨진다.
 *  homeMode 는 "무엇을 보여줄지"만 정하고 "어디에 둘지"는 절대 정하지 않는다.
 *
 *  · Large Title nav · Grouped Inset Lists · 오렌지 스트릭 칩(→ /progress)
 * ────────────────────────────────────────────────────────────────── */

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 스냅샷/조회 결과가 "지금 화면의 계정·날짜" 것인지 판정하는 키.
 * 결과를 이 키와 함께 저장해 두면 계정·날짜가 바뀌는 순간 파생값이 저절로
 * "로딩 전" 상태가 되므로, 효과 본문에서 초기화 setState 를 부를 필요가 없다.
 */
function docKey(uid: string | undefined, ymd: string): string {
  return `${uid ?? ""}:${ymd}`;
}

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

/** 헤더 우상단 칩 — 성장 단계·스트릭이 같은 탭 타깃/여백/hover 규칙을 공유한다. */
function HeaderChip({
  bg,
  ariaLabel,
  onClick,
  children,
}: {
  bg: string;
  ariaLabel: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full hover:opacity-80 transition-opacity"
      style={{ background: bg }}
    >
      {children}
    </button>
  );
}

const IconGear = ({ size = 24 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.04 1.56V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.11-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06A2 2 0 1 1 4.13 16.92l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1.04H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.65 8.83a1.7 1.7 0 0 0-.34-1.87l-.06-.06A2 2 0 1 1 7.08 4.07l.06.06a1.7 1.7 0 0 0 1.87.34H9a1.7 1.7 0 0 0 1.04-1.56V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1.04 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06A2 2 0 1 1 19.93 7.08l-.06.06a1.7 1.7 0 0 0-.34 1.87V9c.27.66.93 1.1 1.65 1.1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1z" />
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
  /** 지금 화면의 계정·날짜 키 — 아래 모든 키 태그 스냅샷이 이 값과 비교한다. */
  const currentKey = docKey(firebaseUser?.uid, ymd);

  // 오늘 문서 — 목표 달성 토글(홈)과 기록 입력(더 보기)이 같은 구독을 공유한다.
  // 키가 어긋나면(계정·날짜 전환 직후) 파생 entry/entryLoaded 가 저절로 "로딩 전"이 된다.
  const [entrySnap, setEntrySnap] = useState<{ key: string; entry: DailyEntry | null } | null>(
    null,
  );
  const [achievedGoals, setAchievedGoals] = useState<string[]>([]);
  const [goalSaving, setGoalSaving] = useState(false);

  // WOOP 실행설계 목록 — "오늘의 if-then" 회전 + 해금 판정. 홈·설정이 같은 훅을 공유한다.
  const { plans, plansLoaded } = useExecutionPlans(firebaseUser);
  const [yesterdayFirstAction, setYesterdayFirstAction] = useState<string | null>(null);
  /**
   * 어제 문서에 잘한 일 기록이 있었는가 — 잘한 일 해금의 "기존 사용자 보존" 신호.
   * 어제 문서는 첫 행동 때문에 이미 읽으므로 추가 조회 비용은 0이다.
   * 조회한 키(uid:ymd)를 값과 함께 담아 둔다 — 계정·날짜가 바뀌면 파생값이 저절로
   * null(판정 보류)이 되므로, 효과 본문에서 초기화 setState 를 부르지 않아도 된다.
   */
  const [yesterdayWins, setYesterdayWins] = useState<{ key: string; hadWins: boolean } | null>(
    null,
  );

  // 7일 리듬 링 — 최근 7일 체크인 날짜. null = 아직 로딩(또는 실패 → 링 생략).
  const [weekCheckedYmds, setWeekCheckedYmds] = useState<Set<string> | null>(null);
  // 체크인 직후 보상 — 이번 세션에서 방금 체크인했을 때만 채워진다.
  const [reward, setReward] = useState<CheckinSubmitResult | null>(null);
  // 주간 회고 (일요일 저녁) — 실패하면 null 로 두고 카드만 생략한다.
  const [weeklyReview, setWeeklyReview] = useState<WeeklyReview | null>(null);

  // 오늘의 동기부여/미래 일상 — 키 불일치(= 아직 이 계정·날짜의 스냅샷 없음)가 곧 로딩 상태다.
  const [motivationSnap, setMotivationSnap] = useState<{
    key: string;
    m: DailyMotivation | null;
  } | null>(null);
  const [motivationError, setMotivationError] = useState<string | null>(null);
  const ensureRequestedYmdRef = useRef<string | null>(null);
  const [alreadyCheckedInToday, setAlreadyCheckedInToday] = useState(false);

  const [visionSnap, setVisionSnap] = useState<{ key: string; v: FutureVision | null } | null>(
    null,
  );
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
    // 키를 함께 저장한다 — 계정·날짜가 바뀌면 파생값이 새 문서를 기다린다(전날 값이 남지 않도록).
    const key = docKey(firebaseUser.uid, ymd);
    const unsub = onDailyEntrySnapshot(firebaseUser.uid, ymd, (next: DailyEntry | null) => {
      setEntrySnap({ key, entry: next });
      setAchievedGoals(Array.isArray(next?.achievedGoals) ? next.achievedGoals : []);
    });
    return unsub;
  }, [firebaseUser, ymd]);

  /** 지금 계정·날짜의 스냅샷 — 도착 전(키 불일치)에는 null = 로딩 전. */
  const curEntry = entrySnap?.key === currentKey ? entrySnap : null;
  const entryLoaded = curEntry !== null;
  const entry = curEntry?.entry ?? null;

  // 알림에 실을 실제 콘텐츠(오늘의 명언 · 미완 과업 넛지)를 서버에서 한 번만 받아 둔다.
  // iOS 는 예약 시점에 문구가 확정돼 있어야 해서 필요하고, Android 는 Worker 가 발송 직전에
  // 직접 부르므로 불필요하다 — 그래서 iOS 에서만 호출한다(웹/Android 는 요청 자체가 없다).
  // 아래 sync 는 목표를 체크할 때마다 다시 도는데, 여기까지 매번 재요청하면 /api/widget/today 를
  // 연타하게 되므로 (계정, 날짜) 당 1회로 묶는다.
  const [notifContent, setNotifContent] = useState<{
    key: string;
    content: NotificationServerContent;
  } | null>(null);
  useEffect(() => {
    if (!firebaseUser || !isIosNotificationAvailable()) return;
    let cancelled = false;
    const key = docKey(firebaseUser.uid, ymd);
    void fetchNotificationContent().then((content) => {
      if (!cancelled) setNotifContent({ key, content });
    });
    return () => {
      cancelled = true;
    };
  }, [firebaseUser, ymd]);

  // iOS 로컬 알림 재동기화 — 홈 방문/목표 체크 때마다 14일 예약 창을 앞으로 밀고,
  // 오늘 목표를 모두 체크했으면 오늘 저녁 리마인더를 침묵시킨다("한 일에는 침묵",
  // lib/notificationPolicy). 그 침묵 자리에만 미완 과업 넛지가 대신 들어간다(총 발송량 증가 0).
  // 권한 프롬프트는 여기서 띄우지 않는다(allowPrompt=false) — 목표를 방금 다 채운 순간
  // (가치 체감 직후)에만 허용해 맥락 없는 권한 요청을 막는다.
  // 웹/Android 에서는 no-op. entryLoaded 전에는 achievedGoals 가 비어 "미완료"로 오판하므로 대기.
  const allGoalsDoneToday =
    goals.length > 0 && goals.every((g) => achievedGoals.includes(g));
  useEffect(() => {
    if (!user || !entryLoaded) return;
    // 콘텐츠가 아직/영영 없어도 동기화는 진행한다 — 정적 폴백 문구로라도 알림은 나가야 한다.
    const content = notifContent?.key === currentKey ? notifContent.content : undefined;
    void syncIosNotifications({
      prefs: normalizeNotificationPrefs(user.notificationPrefs),
      todayGoalDone: allGoalsDoneToday,
      allowPrompt: allGoalsDoneToday,
      texts: buildNotificationTexts(t, {
        morningByYmd: content?.morningOverrides,
        eveningPendingTask: content?.eveningPendingTask,
      }),
    });
  }, [user, entryLoaded, allGoalsDoneToday, t, notifContent, currentKey]);

  // 어제 저녁에 적은 "내일 첫 행동" — 아침 카드 보조 행. 실패해도 카드만 생략.
  // 같은 문서에서 "어제 잘한 일을 적었는가"도 함께 읽는다(잘한 일 해금의 보존 신호).
  useEffect(() => {
    if (!firebaseUser) return;
    let cancelled = false;
    const key = docKey(firebaseUser.uid, ymd);
    getDailyEntryOnce(firebaseUser.uid, yesterdayKstYmd(ymd))
      .then((prev) => {
        if (cancelled) return;
        const txt = (prev?.tomorrowFirstAction ?? "").trim();
        setYesterdayFirstAction(txt.length > 0 ? txt : null);
        setYesterdayWins({ key, hadWins: hasAnyWin(prev?.wins) });
      })
      .catch((err) => {
        console.error("[home] 어제 첫 행동 조회 실패(생략):", err);
        if (cancelled) return;
        setYesterdayFirstAction(null);
        // 조회 실패는 보존 신호만 포기하고 판정은 진행 — 잠금 화면에 갇히지 않게.
        setYesterdayWins({ key, hadWins: false });
      });
    return () => {
      cancelled = true;
    };
  }, [firebaseUser, ymd]);

  /** 어제 조회 결과 — 지금 보고 있는 계정·날짜의 것일 때만 유효(아니면 null = 판정 보류). */
  const yesterdayHadWins =
    yesterdayWins && yesterdayWins.key === currentKey ? yesterdayWins.hadWins : null;

  /** 어제·오늘 문서에 기록이 있는가 — 잘한 일 해금의 "이미 쓰던 계정" 신호(추가 조회 없음). */
  const winsRecordedRecently = hasAnyWin(entry?.wins) || yesterdayHadWins === true;

  /* 잘한 일 보존 표식 — 해금 게이트 도입 전부터 기록을 쓰던 계정에 딱 한 번 찍는다.
   * 표식이 없고 최근 기록이 확인될 때만 쓰므로 계정당 최대 1회 쓰기이고, 그 뒤로는
   * 어제·오늘 문서와 무관하게 영구히 열린다(기록을 하루 걸렀다고 다시 잠그지 않는다).
   * 실패해도 화면은 이미 열려 있으므로 조용히 넘기고 다음 홈 방문에서 다시 시도한다. */
  const winsUnlockMarkedRef = useRef(false);
  useEffect(() => {
    if (!firebaseUser || !user || user.winsUnlockedAt) return;
    if (!entryLoaded || !winsRecordedRecently) return;
    if (winsUnlockMarkedRef.current) return;
    winsUnlockMarkedRef.current = true;
    markWinsUnlocked(firebaseUser.uid).catch((err) => {
      console.error("[home] 잘한 일 보존 표식 저장 실패(다음 방문에 재시도):", err);
      winsUnlockMarkedRef.current = false;
    });
  }, [firebaseUser, user, entryLoaded, winsRecordedRecently]);

  useEffect(() => {
    if (!firebaseUser) return;
    const key = docKey(firebaseUser.uid, ymd);
    let cancelled = false;
    const unsub = onDailyMotivationSnapshot(
      firebaseUser.uid,
      ymd,
      (m) => {
        if (cancelled) return;
        setMotivationSnap({ key, m });
        if (m) setMotivationError(null);
        if (!m && ensureRequestedYmdRef.current !== ymd) {
          ensureRequestedYmdRef.current = ymd;
          authedFetch("/api/daily-motivation", {
            method: "POST",
            body: JSON.stringify({ ymd }),
          })
            .then(async (res) => {
              // 402 는 업그레이드 시트가 안내한다 — 인라인 에러로 같은 말을 겹치지 않는다.
              if (isPaymentRequired(res)) return;
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
      // 이 키의 스냅샷이 이미 도착해 있었다면 화면의 카드는 유지한다.
      () => {
        if (cancelled) return;
        setMotivationSnap((cur) => (cur && cur.key === key ? cur : { key, m: null }));
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
      // Pro 전용 — 업그레이드 시트가 이미 떴으므로 조용히 종료한다.
      if (isPaymentRequired(res)) return;
      const data = (await res.json().catch(() => ({}))) as {
        motivation?: DailyMotivation;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || "다시 받기에 실패했어요.");
      if (data.motivation) {
        setMotivationSnap({ key: currentKey, m: data.motivation });
      }
      // motivation 의 quote/author/goalsSnapshot 이 바뀌었으므로 위젯도 새 카드를 받아가야 한다.
      // 안 호출하면 다음 정주기 Worker(3시간) 까지 위젯과 홈의 명언이 어긋난다.
      notifyAndroidWidgetRefresh();
      void refreshIosWidget();
    } catch (err) {
      setMotivationError(err instanceof Error ? err.message : String(err));
    }
  }, [currentKey, ymd]);

  /** 지금 계정·날짜의 동기부여 스냅샷 — 도착 전(키 불일치)에는 null = 로딩 중. */
  const curMotivation = motivationSnap?.key === currentKey ? motivationSnap : null;
  const motivation = curMotivation?.m ?? null;
  const motivationLoading = curMotivation === null;

  // ── 미래 일상 비전: 구독 + 캐시 미스 시 자동 생성 (동기부여 카드와 동일 패턴) ──
  // futurePersona 가 비어 있으면 빈 비전을 만들지 않고 CTA 만 보여준다(서버 호출 생략).
  useEffect(() => {
    if (!firebaseUser) return;
    const personaWritten = Boolean((user?.futurePersona ?? "").trim());
    const key = docKey(firebaseUser.uid, ymd);
    let cancelled = false;
    const unsub = onFutureVisionSnapshot(
      firebaseUser.uid,
      ymd,
      (v) => {
        if (cancelled) return;
        setVisionSnap({ key, v });
        // 새 비전이 도착하면(스냅샷/재생성 성공) 직전 재생성 오류 메시지는 더 이상 유효하지 않다.
        if (v) setVisionError(null);
        if (!v && personaWritten && ensureRequestedVisionYmdRef.current !== ymd) {
          ensureRequestedVisionYmdRef.current = ymd;
          authedFetch("/api/future-vision", {
            method: "POST",
            body: JSON.stringify({ ymd }),
          })
            .then(async (res) => {
              // 402 는 업그레이드 시트가 안내한다 — 인라인 에러로 같은 말을 겹치지 않는다.
              if (isPaymentRequired(res)) return;
              if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error((data as { error?: string }).error || "꿈이 이뤄진 하루를 만들지 못했어요.");
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
        // 로딩을 풀고 오류 문구를 노출한다. 이미 도착한 이 키의 비전은 유지한다.
        if (cancelled) return;
        setVisionSnap((cur) => (cur && cur.key === key ? cur : { key, v: null }));
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
      // Pro 전용 — 업그레이드 시트가 이미 떴으므로 조용히 종료한다.
      if (isPaymentRequired(res)) return;
      const data = (await res.json().catch(() => ({}))) as {
        vision?: FutureVision;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || "또 다른 하루를 그리지 못했어요.");
      if (data.vision) {
        setVisionSnap({ key: currentKey, v: data.vision });
      }
      // 재생성으로 오늘 비전 문서가 바뀌었으니 위젯도 깨워 같은 하루를 보게 한다
      //  (동기부여 카드 재생성과 동일 — 안 하면 위젯이 옛 비전을 들고 있어 앱과 불일치).
      notifyAndroidWidgetRefresh();
      void refreshIosWidget();
    } catch (err) {
      setVisionError(err instanceof Error ? err.message : String(err));
    }
  }, [currentKey, ymd]);

  /** 지금 계정·날짜의 비전 스냅샷 — 도착 전(키 불일치)에는 null = 로딩 중. */
  const curVision = visionSnap?.key === currentKey ? visionSnap : null;
  const vision = curVision?.v ?? null;
  const visionLoading = curVision === null;

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
   * 오늘 카드는 항상 같은 자리(고정 순서 ②)에 있으므로 탭 전환이 필요 없다.
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
    // 조건을 만족하지 않으면 조회하지 않는다(평일 비용 0).
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
        goalStreakCount?: number;
        growthVotes?: number;
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
        goalStreakCount: data.goalStreakCount,
        growthVotes: data.growthVotes,
      };
    },
    [ymd, refreshUser],
  );

  const uid = firebaseUser?.uid ?? "";

  /** 목표 달성 토글 — 오늘 카드(첫 목표)와 더 보기(추가 목표)가 공유한다. */
  const handleToggleGoalAchieved = useCallback(
    async (goalText: string) => {
      const trimmed = goalText.trim();
      if (!trimmed || !uid) return;
      const prev = achievedGoals;
      const next = prev.includes(trimmed)
        ? prev.filter((g) => g !== trimmed)
        : [...prev, trimmed];
      setAchievedGoals(next);
      setGoalSaving(true);
      try {
        await saveDailyAchievedGoals(uid, ymd, next);
        notifyAndroidWidgetRefresh();
        void refreshIosWidget();
      } catch (err) {
        console.error("[home] 목표 달성 저장 실패:", err);
        setAchievedGoals(prev);
        window.alert(t("common.saveFailed"));
      } finally {
        setGoalSaving(false);
      }
    },
    [achievedGoals, t, uid, ymd],
  );

  const openSettings = useCallback(() => router.push("/settings"), [router]);

  // 앱(TWA) 콜드 스타트가 가장 오래 머무는 화면 — 스피너만 돌리지 않고
  // 제품의 한 문장을 크게 보여준다 (components/ui/BootSplash).
  if (loading || !firebaseUser) {
    return <BootSplash />;
  }

  const futureText = user?.futurePersona || "";
  const streakCount = user?.affirmationStreak?.count ?? 0;
  const longDate = formatLongDate(ymd, locale);
  // 오늘의 if-then — 홈과 위젯이 같은 순수 회전(lib/planRotation)을 써 항상 일치한다.
  const todayPlan = pickTodayPlan(plans, uid, ymd);
  // 회전 대상 개수 — 카드의 "매일 하나씩 돌아가며" 안내 조건(회전과 같은 active 판정).
  const activePlanCount = plans.filter((p) => p.active !== false).length;

  const affirmations = user?.successAffirmations ?? [];
  // 오늘 새길 다짐 — 서버 체크인 트랜잭션과 같은 순수 함수를 공유하므로 판정이 어긋나지 않는다.
  const todayFocusIndex = pickTodayAffirmationIndex(uid, ymd, affirmations.length);

  // 오늘 확인할 목표는 첫 칸 하나. 나머지(해금분)는 "더 보기" 안에서 다룬다.
  const primaryGoal = (goals[0] ?? "").trim();
  // 해금 게이지는 다짐 전사·목표 달성 두 축 중 큰 값으로 찬다.
  const slots = computeGoalSlots({
    affirmation: user?.affirmationStreak,
    goal: user?.goalStreak,
    currentGoalCount: goals.length,
  });

  // 실행 설계 해금 — 플랜 첫 스냅샷 전(null)에는 카드를 그리지 않는다(깜빡임 방지).
  const planUnlock = plansLoaded
    ? computePlanUnlock({
        affirmation: user?.affirmationStreak,
        goal: user?.goalStreak,
        goalCount: goals.filter((g) => g.trim().length > 0).length,
        planCount: plans.length,
      })
    : null;

  // 잘한 일 기록 해금 — 오늘/어제 문서가 도착하기 전에는 판정을 미룬다(잠금 깜빡임 방지).
  const winsUnlock =
    entryLoaded && yesterdayHadWins !== null
      ? computeWinsUnlock({
          affirmation: user?.affirmationStreak,
          goal: user?.goalStreak,
          alreadyRecorded: Boolean(user?.winsUnlockedAt) || winsRecordedRecently,
        })
      : null;

  // 성장 단계 칩 — 증거 표가 1표라도 쌓인 뒤에만 그린다(레거시/빈 계정은 조용히 생략).
  const growthStage = growthStageOf(user?.growth?.votes);

  // 스텝업 초안 — 첫 목표에 숫자가 있고 목표 달성 스트릭이 이어졌을 때만 나온다.
  const stepUpDraft = suggestStepUp(primaryGoal, user?.goalStreak?.count ?? 0);

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

  /* ───── render ───── */

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-[var(--bg-grouped)] pb-12">
      {/* ── Large Title bar — Apple iOS native pattern ── */}
      <header className="bg-[var(--bg-grouped)] pt-3 pb-2">
        {/* 상단 브랜드 로고 — 앱 진입 직후 가장 먼저 보이는 brand identity. */}
        <div className="mx-auto flex max-w-3xl items-center justify-center px-5 pt-1 pb-2">
          <Logo variant="lockup" tone="light" size={22} alt="Anima" priority />
        </div>
        <div className="mx-auto flex max-w-3xl items-center justify-between px-2 min-h-[44px]">
          <div className="w-[44px]" />
          <div className="flex items-center gap-2">
            {/* 성장 단계 칩 — 누적 증거 표의 현재 단계. 탭하면 /progress (입력 요구 0). */}
            {growthStage && (
              <HeaderChip
                bg="rgba(30,27,75,0.08)"
                ariaLabel={t("growth.title")}
                onClick={() => router.push("/progress")}
              >
                <span className="text-[12px] leading-none" aria-hidden>
                  {growthStage.emoji}
                </span>
                <span className="text-[12px] font-semibold tracking-[0.4px] text-[#1E1B4B] tabular-nums">
                  {t(growthStage.labelKey)} · {growthStage.votes}
                </span>
              </HeaderChip>
            )}
            {/* 스트릭 칩 — 탭하면 /progress (히트맵·최고기록·정체성 장부) 로 이동 */}
            <HeaderChip
              bg="rgba(255,149,0,0.16)"
              ariaLabel={t("progress.chipAria")}
              onClick={() => router.push("/progress")}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="#D85A30" aria-hidden>
                <path d="M13 2L4.5 13.5h6L9 22l8.5-11.5h-6L13 2z" />
              </svg>
              <span className="text-[12px] font-semibold tracking-[0.4px] text-[#D85A30]">
                {streakCount}
              </span>
            </HeaderChip>
            <button
              type="button"
              onClick={openSettings}
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

      <main className="mx-auto w-full max-w-3xl">
        {/* ── 무료 체험 D-day / 만료 안내 — 결제 가능 환경에서만 업그레이드 CTA 노출 ── */}
        <TrialBanner />

        {/* ── 스트릭 공백 감지 — 프리즈 안내 칩 / 자기연민 재약속 카드 ── */}
        <RecommitCard
          streak={user?.affirmationStreak}
          todayYmd={ymd}
          alreadyCheckedInToday={alreadyCheckedInToday}
          onCheckinCta={handleCheckinCta}
        />

        {/* ── 선언이 목표의 파생본인 레거시 계정에만 뜨는 1회성 안내 ── */}
        <DeclarationNudgeCard
          declaration={affirmations[0] ?? ""}
          goal={primaryGoal}
          onEdit={() => router.push("/settings?sheet=affirmations")}
        />

        {/* ── 목표 칸이 열린 그 순간에만 뜨는 1회성 배너 ── */}
        <SlotUnlockBanner
          earned={slots.earned}
          progress={slots.progress}
          source={slots.source}
          onAddGoal={() => router.push("/settings?sheet=goals")}
          onRefineGoal={() => router.push("/settings?sheet=goals&refine=1")}
        />

        {/* ── 목표 달성이 이어졌을 때 한 번만 뜨는 스텝업 제안 ── */}
        <StepUpCard
          draft={stepUpDraft}
          onApply={() => router.push("/settings?sheet=goals&refine=1")}
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

        {/* ─── ② 오늘 — 선언 1줄 전사 + 그 꿈을 사는 하루 + 목표 실행 체크(하루의 유일한 필수) ─── */}
        <div className="px-4 pt-5" ref={checkinAnchorRef}>
          <TodayCard
            affirmations={affirmations}
            focusIndex={todayFocusIndex}
            streakCount={streakCount}
            alreadyCheckedIn={alreadyCheckedInToday}
            reward={reward}
            onSubmitCheckin={handleAffirmationCheckin}
            onCheckedIn={setReward}
            goal={primaryGoal.length > 0 ? primaryGoal : null}
            goalAchieved={achievedGoals.includes(primaryGoal)}
            goalSaving={goalSaving}
            onToggleGoal={() => void handleToggleGoalAchieved(primaryGoal)}
            onSetGoal={() => router.push("/settings?sheet=goals")}
            visionSlot={
              <FutureVisionCard
                vision={vision}
                loading={visionLoading}
                errorMessage={visionError}
                onRegenerate={handleRegenerateFutureVision}
                hasFuturePersona={futureText.trim().length > 0}
                onWriteFuturePersona={openSettings}
              />
            }
          />
        </div>

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

        {/* ─── ▸ 더 보기 (기본 접힘) — 나머지 전부 ─── */}
        <MoreSection
          uid={uid}
          ymd={ymd}
          entry={entry}
          entryLoaded={entryLoaded}
          homeMode={homeMode}
          futureText={futureText}
          todayPlan={todayPlan}
          activePlanCount={activePlanCount}
          yesterdayFirstAction={yesterdayFirstAction}
          goals={goals}
          identityLabels={user?.identities?.labels ?? []}
          unlock={planUnlock}
          winsUnlock={winsUnlock}
          achievedGoals={achievedGoals}
          onToggleGoalAchieved={(g) => void handleToggleGoalAchieved(g)}
          weeklyReview={showWeeklyReview ? weeklyReview : null}
          onOpenSettings={openSettings}
          onOpenWinsHistory={() => router.push("/wins-history")}
        />
      </main>
    </div>
  );
}
