"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth, fetchNativeBridgeToken } from "@/lib/auth-context";
import {
  updateFutureSelf,
  updateUserGoals,
  updateQuotePreference,
  updateSuccessAffirmations,
  updateUserLanguage,
  onExecutionPlansSnapshot,
  MAX_SUCCESS_AFFIRMATIONS,
  type ExecutionPlanWithId,
} from "@/lib/firebase";
import {
  FUTURE_SELF_DIMENSIONS,
  FUTURE_SELF_FIELD_MAX,
  hasAnyFutureSelfAnswer,
  type FutureSelfDimension,
} from "@/lib/futureSelf";
import { computeGoalSlots } from "@/lib/goalSlots";
import { missingGoalSignals, needsMoreSpecificGoal, type GoalSignal } from "@/lib/goalQuality";
import { GOAL_SLOT_MAX, GOAL_TEXT_MAX } from "@/lib/constants/goal";
import type { FutureSelfAnswers } from "@/types";
import type { DictKey } from "@/lib/i18n";
import { authedFetch } from "@/lib/authedFetch";
import {
  isIosPurchaseAvailable,
  getIosProPrice,
  purchaseIosPro,
  restoreIosPro,
  initIosPurchaseListener,
} from "@/lib/iosPurchase";
import {
  isAndroidPurchaseAvailable,
  getAndroidProPrice,
  purchaseAndroidPro,
  restoreAndroidPro,
} from "@/lib/androidPurchase";
import { readEntitlement } from "@/lib/entitlement";
import { isAndroidApp, notifyAndroidPurchase, notifyAndroidRestore } from "@/lib/widgetBridge";
import { getAllKnownAuthorsGrouped } from "@/lib/famousQuoteCatalog";
import AffirmationsEditor from "@/components/affirmations/AffirmationsEditor";
import NoticeDialog from "@/components/ui/NoticeDialog";
import GroupedSection from "@/components/ui/GroupedSection";
import Sheet from "@/components/ui/Sheet";
import ExecutionPlansSection from "@/components/woop/ExecutionPlansSection";
import { useLanguage, LOCALE_META, SUPPORTED_LOCALES, type Locale } from "@/lib/i18n";

/* ─────────────────────────────────────────────────────────────────
 * Settings — Apple iOS native redesign
 *  · Large Title nav with back button
 *  · Profile card with gradient avatar + orange streak chip
 *  · Grouped Inset Lists with COLORED icon squares (Settings.app pattern)
 *  · Destructive actions in System Red
 * ───────────────────────────────────────────────────────────────── */

/** 미래 서술의 기본 질문 — 온보딩에서 유일하게 묻는 차원. 나머지는 "더 자세히" 뒤로. */
const PRIMARY_FUTURE_DIMENSION: FutureSelfDimension = "daily";

/** 구체성 신호 → i18n 라벨/예시 키. 빠진 신호만 칩으로 보여준다. */
const GOAL_SIGNAL_LABEL_KEY: Record<GoalSignal, DictKey> = {
  count: "goal.specific.count",
  cadence: "goal.specific.cadence",
  unit: "goal.specific.unit",
};
const GOAL_SIGNAL_EXAMPLE_KEY: Record<GoalSignal, DictKey> = {
  count: "goal.specific.countExample",
  cadence: "goal.specific.cadenceExample",
  unit: "goal.specific.unitExample",
};

/** 차원 → i18n 질문/placeholder 키 (온보딩과 동일 키 재사용). */
const FUTURE_Q_KEY: Record<FutureSelfDimension, DictKey> = {
  daily: "onboarding.futureSelf.daily.q",
  work: "onboarding.futureSelf.work.q",
  wealth: "onboarding.futureSelf.wealth.q",
  family: "onboarding.futureSelf.family.q",
  achievements: "onboarding.futureSelf.achievements.q",
  respect: "onboarding.futureSelf.respect.q",
  growth: "onboarding.futureSelf.growth.q",
};
const FUTURE_PH_KEY: Record<FutureSelfDimension, DictKey> = {
  daily: "onboarding.futureSelf.daily.placeholder",
  work: "onboarding.futureSelf.work.placeholder",
  wealth: "onboarding.futureSelf.wealth.placeholder",
  family: "onboarding.futureSelf.family.placeholder",
  achievements: "onboarding.futureSelf.achievements.placeholder",
  respect: "onboarding.futureSelf.respect.placeholder",
  growth: "onboarding.futureSelf.growth.placeholder",
};

/** 결제 대기 폴링 시작 간격(ms). 이후 백오프로 늘어난다. */
const ENTITLEMENT_POLL_INTERVAL_MS = 2_000;
/** 폴링 백오프 상한(ms) — getIdTokenResult(true) 강제 갱신 호출 빈도를 낮춰 토큰 스로틀을 피한다. */
const ENTITLEMENT_POLL_MAX_INTERVAL_MS = 5_000;
/** 결제 시트에서 복귀(visible)한 뒤, 권한 없음을 미완료로 판정하기까지의 유예 폴링 횟수. */
const ENTITLEMENT_RETURN_GRACE_POLLS = 3;
/** 페이지가 계속 보이는(hidden 전이 없던) 상태에서의 대기 상한 — 네이티브가 결제 시트도 못 띄우고 즉시 종료한 실패를 빠르게 감지. */
const ENTITLEMENT_VISIBLE_TIMEOUT_MS = 45_000;
/** 결제 시트가 오래 떠 있어도 무한 대기는 막는 절대 상한 — 진행 중 결제를 끊지 않도록 넉넉히. */
const ENTITLEMENT_HARD_CEILING_MS = 5 * 60_000;

/**
 * 네이티브 결제 브릿지(anima://purchase)는 서버가 해당 uid 에 paid claim 을 박는 것으로 완료된다.
 * 웹은 같은 uid 이므로 getIdToken(true) 강제 갱신으로 새 claim 을 감지한다(별도 토큰 전달 불필요).
 *
 * 복귀 감지는 폴링 샘플링 대신 visibilitychange 이벤트로 한다 — 반투명 결제 액티비티/짧은 브릿지가
 * 폴링 간격 사이에 hidden→visible 로 스쳐 지나가도 이벤트는 그 전이를 놓치지 않는다.
 *
 * 종료 규칙:
 *   · paid claim 감지 → true.
 *   · 결제 시트를 봤다가(hidden) 돌아온(visible) 뒤 유예 폴링 안에도 권한이 없으면 → false(취소/실패).
 *   · 한 번도 hidden 이 안 됐고 보이는 채로 상한 초과 → false(네이티브 즉시 종료 = 미로그인/상품조회 실패 등).
 *   · 결제 시트가 떠 있는(hidden) 동안은 상한을 적용하지 않아 진행 중 결제를 끊지 않는다(절대 상한만 방어).
 *
 * @returns true=권한 부여 확인. false=미완료(취소·실패·타임아웃) — 호출부가 안내 다이얼로그를 띄운다.
 */
async function waitForNativeEntitlement(
  user: { getIdTokenResult: (force?: boolean) => Promise<{ claims: Record<string, unknown> }> },
  { maxMs = ENTITLEMENT_VISIBLE_TIMEOUT_MS, intervalMs = ENTITLEMENT_POLL_INTERVAL_MS, signal }: {
    maxMs?: number;
    intervalMs?: number;
    /** 컴포넌트 언마운트 시 폴링을 즉시 중단하기 위한 신호(백그라운드 폴링·토큰 스로틀 방지). */
    signal?: AbortSignal;
  } = {},
): Promise<boolean> {
  const hasDocument = typeof document !== "undefined";
  let sawHidden = false;
  let visible = hasDocument ? document.visibilityState !== "hidden" : true;
  const onVisibility = () => {
    if (document.visibilityState === "hidden") {
      sawHidden = true;
      visible = false;
    } else {
      visible = true;
    }
  };
  if (hasDocument) document.addEventListener("visibilitychange", onVisibility);

  try {
    const start = Date.now();
    let pollsAfterReturn = 0;
    let currentInterval = intervalMs;
    for (;;) {
      if (signal?.aborted) return false; // 언마운트/중단 — 더 이상 폴링하지 않는다.
      try {
        const tr = await user.getIdTokenResult(true);
        const ent = readEntitlement(tr.claims);
        if (ent.kind === "lifetime" || ent.kind === "subscription") return true;
      } catch {
        // 토큰 갱신 일시 실패 — 다음 폴링에서 재시도.
      }

      const elapsed = Date.now() - start;
      if (elapsed >= ENTITLEMENT_HARD_CEILING_MS) return false;
      if (visible) {
        if (sawHidden) {
          // 결제 시트/브릿지에서 돌아왔다 — 유예 폴링 안에도 권한이 없으면 미완료로 종료.
          pollsAfterReturn += 1;
          if (pollsAfterReturn >= ENTITLEMENT_RETURN_GRACE_POLLS) return false;
        } else if (elapsed >= maxMs) {
          // 결제 시트가 한 번도 안 떴다 = 네이티브가 즉시 종료(미로그인/상품조회 실패 등).
          return false;
        }
      }
      await new Promise((resolve) => setTimeout(resolve, currentInterval));
      // 백오프 — 강제 토큰 갱신 호출을 점점 뜸하게 해 스로틀(auth/quota-exceeded) 위험을 낮춘다.
      currentInterval = Math.min(Math.round(currentInterval * 1.5), ENTITLEMENT_POLL_MAX_INTERVAL_MS);
    }
  } finally {
    if (hasDocument) document.removeEventListener("visibilitychange", onVisibility);
  }
}

/* ───── SF-Symbol-style glyphs in white on colored squares ───── */
const G = {
  user: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="white" aria-hidden>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" stroke="white" strokeWidth="2" fill="none" strokeLinecap="round" />
    </svg>
  ),
  target: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="1" fill="white" />
    </svg>
  ),
  spark: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="white" aria-hidden>
      <path d="M12 2l1.5 6.5L20 10l-6.5 1.5L12 18l-1.5-6.5L4 10l6.5-1.5L12 2z" />
    </svg>
  ),
  book: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="white" aria-hidden>
      <path d="M4 4h7v15H4zM13 4h7v15h-7z" />
    </svg>
  ),
  globe: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18" />
    </svg>
  ),
  calendar: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="white" aria-hidden>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <rect x="3" y="5" width="18" height="4" fill="rgba(0,0,0,0.2)" />
      <rect x="7" y="2" width="2" height="5" rx="1" />
      <rect x="15" y="2" width="2" height="5" rx="1" />
    </svg>
  ),
  bolt: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="white" aria-hidden>
      <path d="M13 2L4.5 13.5h6L9 22l8.5-11.5h-6L13 2z" />
    </svg>
  ),
  shield: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="white" aria-hidden>
      <path d="M12 2l8 4v6c0 5-3.5 9-8 10-4.5-1-8-5-8-10V6l8-4z" />
    </svg>
  ),
  doc: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="white" aria-hidden>
      <path d="M6 2h9l4 4v16H6z" />
    </svg>
  ),
  out: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M9 4H5v16h4M15 8l4 4-4 4M9 12h10" />
    </svg>
  ),
  trash: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="white" aria-hidden>
      <path d="M5 7h14l-1 13H6L5 7zM9 4h6v3H9z" />
    </svg>
  ),
};

function IconChevron() {
  return (
    <svg width="8" height="14" viewBox="0 0 8 14" fill="none" aria-hidden>
      <path d="M1 1l6 6-6 6" stroke="rgba(60,60,67,0.3)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconBack() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden>
      <path d="M14 4l-7 7 7 7" stroke="#D85A30" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ───── Reusable inset card primitives ───── */

function SettingsRow({
  color,
  glyph,
  title,
  detail,
  destructive,
  onClick,
  isLast,
}: {
  color: string;
  glyph: React.ReactNode;
  title: string;
  detail?: string;
  destructive?: boolean;
  onClick?: () => void;
  isLast?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full relative flex items-center gap-3 px-4 min-h-[44px] text-left"
    >
      <div
        className="w-[30px] h-[30px] rounded-[7px] flex items-center justify-center flex-shrink-0"
        style={{ background: color, boxShadow: "inset 0 0 0 0.5px rgba(0,0,0,0.05)" }}
      >
        {glyph}
      </div>
      <div
        className="flex-1 py-[11px] text-[17px] leading-[22px] tracking-[-0.43px]"
        style={{ color: destructive ? "#FF3B30" : "var(--label)" }}
      >
        {title}
      </div>
      {detail && (
        <span className="text-[17px] tracking-[-0.43px] text-[var(--label-2)]">{detail}</span>
      )}
      <IconChevron />
      {!isLast && (
        <div className="absolute bottom-0 right-0 h-[0.5px]" style={{ left: 58, background: "var(--sep)" }} />
      )}
    </button>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const { user, firebaseUser, loading: authLoading, signOut, refreshUser } = useAuth();
  const { t, locale, setLocale } = useLanguage();
  const [languageSaving, setLanguageSaving] = useState(false);

  const [futureSelfDraft, setFutureSelfDraft] = useState<FutureSelfAnswers>({});
  const [futureSaving, setFutureSaving] = useState(false);
  const [futureOpen, setFutureOpen] = useState(false);
  const [portraitRegenLoading, setPortraitRegenLoading] = useState(false);

  const [goals, setGoals] = useState<string[]>([]);
  const [goalsOpen, setGoalsOpen] = useState(false);
  /** 홈의 해금 배너에서 "더 구체적으로"로 들어온 경우 — 해당 줄의 구체성 힌트를 항상 펼친다. */
  const [refineIdx, setRefineIdx] = useState<number | null>(null);
  /** 미래 서술 나머지 6문항 펼침 — 기본은 접힘(온보딩에서 묻지 않는 항목들). */
  const [futureDetailOpen, setFutureDetailOpen] = useState(false);
  // WOOP 실행설계 목록 — 홈과 동일한 섹션/시트를 설정에서도 노출.
  const [plans, setPlans] = useState<ExecutionPlanWithId[]>([]);

  const [affirmations, setAffirmations] = useState<string[]>([]);
  const [affirmationsOpen, setAffirmationsOpen] = useState(false);
  const [affirmationsSaving, setAffirmationsSaving] = useState(false);

  const [pinnedAuthor, setPinnedAuthor] = useState<string>("");
  const [pinnedDays, setPinnedDays] = useState<number>(0);
  const [authorOpen, setAuthorOpen] = useState(false);

  const [languageOpen, setLanguageOpen] = useState(false);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  // Anima Pro(iOS 인앱결제) — 네이티브 플러그인이 있는 iOS 빌드에서만 노출.
  const [showPro, setShowPro] = useState(false);
  const [proActive, setProActive] = useState(false);
  const [proPrice, setProPrice] = useState<string | null>(null);
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  // 안드로이드 결제 브릿지에 실어 보낼 네이티브 로그인용 세션 토큰을 미리 받아 둔다.
  // 클릭 시점에 fetch 를 await 하면 그 사이 user-activation 이 만료돼 결제 intent 가
  // Chrome 게이트에 걸릴 수 있으므로, 미리 받아 두고 제스처 안에서 동기 발화한다.
  const bridgeTokenRef = useRef<string | null>(null);
  // 결제/복원 대기 폴링 취소용 — 언마운트 또는 다른 결제 액션 시작 시 이전 폴링을 끊는다.
  const pollAbortRef = useRef<AbortController | null>(null);
  // 결제/복원 결과 안내 — window.alert(TWA 에서 origin 헤더가 붙어 앱답지 않음) 대신 인앱 다이얼로그.
  const [proNotice, setProNotice] = useState<{
    title: string;
    description?: string;
    tone?: "success" | "error";
  } | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!firebaseUser) router.replace("/login");
  }, [authLoading, firebaseUser, router]);

  // WOOP 실행설계 구독 — 실패 시 섹션만 비운다(설정 나머지는 정상 동작).
  useEffect(() => {
    if (!firebaseUser) return;
    const unsub = onExecutionPlansSnapshot(firebaseUser.uid, setPlans, () => setPlans([]));
    return unsub;
  }, [firebaseUser]);

  // 언마운트 시 진행 중이던 결제/복원 폴링을 중단한다(백그라운드 폴링·토큰 스로틀 방지).
  useEffect(() => {
    return () => pollAbortRef.current?.abort();
  }, []);

  // iOS(StoreKit) / Android(네이티브 브릿지) 결제 가용 시: 섹션 노출 + 가격/권한 로드.
  //  · 안드로이드는 TWA 웹 Digital Goods 위임이 Android 13+ 에서 깨지므로(clientAppUnavailable)
  //    네이티브 브릿지 결제를 쓴다. 따라서 "앱 안(isAndroidApp)" 이기만 하면 섹션을 노출한다.
  useEffect(() => {
    const iosOk = isIosPurchaseAvailable();
    const digitalGoodsOk = isAndroidPurchaseAvailable();
    const androidApp = isAndroidApp();
    if (!iosOk && !androidApp && !digitalGoodsOk) return;
    setShowPro(true);
    if (iosOk) initIosPurchaseListener();
    let cancelled = false;
    void (async () => {
      // 가격: iOS=StoreKit, Android=Digital Goods 조회가 되면 표기(안 되면 Play 결제 시트가 가격을 보여줌).
      const price = iosOk
        ? await getIosProPrice()
        : digitalGoodsOk
          ? await getAndroidProPrice()
          : null;
      if (!cancelled && price) setProPrice(price);
      if (!firebaseUser) return;
      try {
        const tokenResult = await firebaseUser.getIdTokenResult();
        const ent = readEntitlement(tokenResult.claims as Record<string, unknown>);
        if (!cancelled) setProActive(ent.kind === "lifetime" || ent.kind === "subscription");
      } catch {
        // 권한 조회 실패 — 구매 버튼은 그대로 노출(복원/구매로 봉합 가능).
      }
      // 안드로이드 네이티브 결제 브릿지용 세션 토큰을 미리 받아 둔다(클릭 시 동기 발화 대비).
      // 실패해도 무해 — 구매 시 캐시가 없으면 그때 한 번 더 시도한다.
      if (androidApp && !iosOk) {
        const token = await fetchNativeBridgeToken(firebaseUser);
        if (!cancelled && token) bridgeTokenRef.current = token;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [firebaseUser]);

  useEffect(() => {
    if (!user) return;
    // 레거시 사용자(구조화 답변 없이 futurePersona 만 있는 경우)는 필드를 공란으로 두고
    // 기존 원문은 시트 하단에 읽기전용으로 보여준다 — 저장 전까지 원문을 건드리지 않는다.
    setFutureSelfDraft(user.futureSelfAnswers ? { ...user.futureSelfAnswers } : {});
    setGoals(user.goals && user.goals.length > 0 ? [...user.goals] : []);
    setPinnedAuthor(user.quotePreference?.pinnedAuthor || "");
    setPinnedDays(user.quotePreference?.pinnedDaysPerWeek ?? 0);
    setAffirmations(
      user.successAffirmations && user.successAffirmations.length > 0
        ? [...user.successAffirmations]
        : [],
    );
  }, [user]);

  /* 홈에서 넘어온 딥링크 — ?sheet=goals[&refine=1] 또는 ?sheet=affirmations.
     useSearchParams 대신 window.location 을 읽는다 — Suspense 경계 없이도 안전하고,
     읽은 뒤 쿼리를 지워 뒤로가기/새로고침에 시트가 다시 열리지 않는다. */
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      const sheet = url.searchParams.get("sheet");
      if (sheet !== "goals" && sheet !== "affirmations") return;
      if (sheet === "goals") {
        setGoalsOpen(true);
        if (url.searchParams.get("refine") === "1") setRefineIdx(0);
      } else {
        setAffirmationsOpen(true);
      }
      url.searchParams.delete("sheet");
      url.searchParams.delete("refine");
      window.history.replaceState({}, "", url.toString());
    } catch {
      /* URL 파싱 불가 환경 — 시트를 열지 않을 뿐 나머지는 정상 동작 */
    }
  }, []);

  /* 이미 나머지 차원까지 채워둔 사용자(기존 7문항 온보딩 이용자)에게는 접혀 있으면
     자기가 쓴 글이 사라진 것처럼 보인다 — 시트를 열 때 내용이 있으면 자동으로 펼친다.
     (state 는 접혀 있어도 보존되므로 저장 자체는 어느 쪽이든 안전하다.) */
  useEffect(() => {
    if (!futureOpen) return;
    const hasDetail = FUTURE_SELF_DIMENSIONS.some(
      (dim) => dim !== PRIMARY_FUTURE_DIMENSION && (futureSelfDraft[dim] ?? "").trim().length > 0,
    );
    if (hasDetail) setFutureDetailOpen(true);
  }, [futureOpen, futureSelfDraft]);

  const goalCount = useMemo(() => goals.filter((g) => g.trim().length > 0).length, [goals]);
  const authorGroups = useMemo(() => getAllKnownAuthorsGrouped(locale), [locale]);
  // 목표 칸 수는 꾸준함으로 열린다(전사·달성 두 축). 기존 사용자는 지금 가진 목표 수만큼 자동 인정된다.
  const goalSlots = useMemo(
    () =>
      computeGoalSlots({
        affirmation: user?.affirmationStreak,
        goal: user?.goalStreak,
        currentGoalCount: user?.goals?.length ?? 0,
      }),
    [user?.affirmationStreak, user?.goalStreak, user?.goals?.length],
  );

  if (authLoading || !firebaseUser) {
    return (
      <div className="flex h-full items-center justify-center bg-[var(--bg-grouped)]">
        <div className="h-6 w-6 animate-spin rounded-full border-[1.5px] border-black/10 border-t-[#D85A30]" />
      </div>
    );
  }

  const uid = firebaseUser.uid;
  // 계정 삭제 확인 키워드는 언어별로 다르다(예: ko "삭제", en "delete", es "eliminar", zh "删除").
  // 안내 문구는 대문자("DELETE")로 표기될 수 있으므로 대소문자 무시 비교한다.
  const deleteKeyword = t("settings.account.delete.confirmInputKeyword");
  const deleteConfirmed =
    deleteConfirmText.trim().toLowerCase() === deleteKeyword.trim().toLowerCase();
  const streakCount = user?.affirmationStreak?.count ?? 0;
  const userInitial = (user?.displayName || user?.email || "?").trim().charAt(0).toUpperCase();
  const userName = user?.displayName || user?.email?.split("@")[0] || "—";
  const userEmail = user?.email || "";

  const handleSaveFuture = async () => {
    setFutureSaving(true);
    try {
      // 전부 공란이면 아무것도 쓰지 않는다 — 레거시 futurePersona 원문을 실수로 지우는 것 방지.
      if (hasAnyFutureSelfAnswer(futureSelfDraft)) {
        await updateFutureSelf(uid, futureSelfDraft);
        await refreshUser().catch(() => {});
      }
      setFutureOpen(false);
    } catch (err) {
      console.error("[settings] 미래의 나 저장 실패:", err);
      window.alert(t("common.saveFailed"));
    } finally {
      setFutureSaving(false);
    }
  };

  /** "초상 다시 그리기" — force=true 는 일별 한도(5회)에 카운트된다. */
  const handleRegeneratePortrait = async () => {
    setPortraitRegenLoading(true);
    try {
      const res = await authedFetch("/api/future-self/portrait", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: true }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(data.error || `${t("common.error")} (${res.status})`);
      }
      await refreshUser().catch(() => {});
    } catch (err) {
      console.error("[settings] 초상 재생성 실패:", err);
      window.alert(
        err instanceof Error && err.message
          ? err.message
          : t("futureSelf.portrait.error"),
      );
    } finally {
      setPortraitRegenLoading(false);
    }
  };

  const handleChangeLanguage = async (next: Locale) => {
    if (next === locale) return;
    setLocale(next);
    setLanguageSaving(true);
    try {
      await updateUserLanguage(uid, next);
      await refreshUser().catch(() => {});
    } catch (err) {
      console.error("[settings] 언어 저장 실패:", err);
      window.alert(t("common.saveFailed"));
    } finally {
      setLanguageSaving(false);
    }
  };

  /* 목표는 성공 선언과 독립이다 — 저장 후 "다짐도 바꿀까요?" 를 묻지 않는다.
     둘은 성격이 다른 문장(선언 = 이미 이룬 상태 / 목표 = 오늘의 행동)이므로
     한쪽을 고쳤다고 다른 쪽을 따라 바꾸자는 제안 자체가 성립하지 않는다. */
  const handleSaveGoals = async () => {
    try {
      const cleaned = goals.map((g) => g.trim()).filter((g) => g.length > 0);
      await updateUserGoals(uid, cleaned);
      await refreshUser().catch(() => {});
      setGoalsOpen(false);
      setRefineIdx(null);
    } catch (err) {
      console.error("[settings] 목표 저장 실패:", err);
      window.alert(t("common.saveFailed"));
    }
  };

  const handleSaveAffirmations = async () => {
    setAffirmationsSaving(true);
    try {
      await updateSuccessAffirmations(uid, affirmations);
      await refreshUser().catch(() => {});
      setAffirmationsOpen(false);
    } catch (err) {
      console.error("[settings] 다짐 저장 실패:", err);
      window.alert(t("common.saveFailed"));
    } finally {
      setAffirmationsSaving(false);
    }
  };

  const handleSaveQuotePreference = async () => {
    try {
      await updateQuotePreference(uid, {
        pinnedAuthor: pinnedAuthor.trim() || undefined,
        pinnedDaysPerWeek: pinnedDays || undefined,
      });
      await refreshUser().catch(() => {});
      setAuthorOpen(false);
    } catch (err) {
      console.error("[settings] 인물 저장 실패:", err);
      window.alert(t("common.saveFailed"));
    }
  };

  const handlePurchasePro = async () => {
    if (purchasing || restoring) return; // 이중 실행/상호 충돌 방지.
    pollAbortRef.current?.abort();
    const controller = new AbortController();
    pollAbortRef.current = controller;
    setPurchasing(true);
    try {
      // 안드로이드 앱(TWA): 웹 Digital Goods 위임이 Android 13+ 에서 깨지므로 네이티브 결제 브릿지로.
      //  브릿지가 결제→서버검증→paid claim 부여까지 하면, 같은 uid 인 웹은 토큰 강제갱신으로 감지한다.
      if (isAndroidApp() && !isIosPurchaseAvailable()) {
        // 네이티브 FirebaseAuth 가 아직 미로그인이면(auth 브릿지 미도달) 결제 시트를 못 띄우고
        // 조용히 종료되던 회귀가 있었다. 웹 세션 토큰을 함께 넘겨 결제 직전 같은 uid 로 로그인시킨다.
        // 미리 받아 둔 토큰(bridgeTokenRef)이 있으면 await 없이 동기 발화 — user-activation 게이트를
        // 확실히 통과한다. 캐시가 없을 때만(프리페치 실패/지연) 여기서 한 번 더 받아온다.
        const bridgeToken =
          bridgeTokenRef.current ?? (await fetchNativeBridgeToken(firebaseUser));
        notifyAndroidPurchase(bridgeToken ?? undefined);
        const ok = firebaseUser
          ? await waitForNativeEntitlement(firebaseUser, { signal: controller.signal })
          : false;
        if (ok) {
          setProActive(true);
          setProNotice({
            title: t("settings.pro.purchaseDone.title"),
            description: t("settings.pro.purchaseDone.desc"),
            tone: "success",
          });
        } else {
          // 미완료(취소/실패/타임아웃) — "처리 중"에 갇힌 채 방치하지 않고 다음 행동을 안내한다.
          // 실제로 결제됐다면 '구매 복원' 또는 다음 진입 시 권한이 자동 반영된다.
          setProNotice({
            title: t("settings.pro.purchaseIncomplete.title"),
            description: t("settings.pro.purchaseIncomplete.desc"),
            tone: "error",
          });
        }
        return;
      }

      const outcome = isIosPurchaseAvailable()
        ? await purchaseIosPro()
        : await purchaseAndroidPro();
      if (outcome.status === "success") {
        setProActive(true);
        setProNotice({
          title: t("settings.pro.purchaseDone.title"),
          description: t("settings.pro.purchaseDone.desc"),
          tone: "success",
        });
      } else if (outcome.status === "pending") {
        setProNotice({
          title: t("settings.pro.pending.title"),
          description: t("settings.pro.pending.desc"),
          tone: "success",
        });
      } else if (outcome.status === "error") {
        setProNotice({
          title: t("settings.pro.purchaseFailed.title"),
          description: outcome.message || t("settings.pro.purchaseFailed.desc"),
          tone: "error",
        });
      }
      // cancelled 는 사용자의 정상 취소 — 안내 없이 조용히 종료.
    } finally {
      setPurchasing(false);
    }
  };

  const handleRestorePro = async () => {
    if (purchasing || restoring) return; // 이중 실행/상호 충돌 방지.
    pollAbortRef.current?.abort();
    const controller = new AbortController();
    pollAbortRef.current = controller;
    setRestoring(true);
    try {
      // 안드로이드 앱(TWA): 네이티브 브릿지로 보유 영수증 재검증(결제 시트 없이).
      if (isAndroidApp() && !isIosPurchaseAvailable()) {
        notifyAndroidRestore();
        const ok = firebaseUser
          ? await waitForNativeEntitlement(firebaseUser, { maxMs: 30_000, signal: controller.signal })
          : false;
        if (ok) {
          setProActive(true);
          setProNotice({
            title: t("settings.pro.restoreDone.title"),
            description: t("settings.pro.restoreDone.desc"),
            tone: "success",
          });
        } else {
          setProNotice({
            title: t("settings.pro.restoreNone.title"),
            description: t("settings.pro.restoreNone.desc"),
            tone: "error",
          });
        }
        return;
      }

      const outcome = isIosPurchaseAvailable()
        ? await restoreIosPro()
        : await restoreAndroidPro();
      if (outcome.status === "success") {
        setProActive(true);
        setProNotice({
          title: t("settings.pro.restoreDone.title"),
          description: t("settings.pro.restoreDone.desc"),
          tone: "success",
        });
      } else if (outcome.status === "error") {
        setProNotice({
          title: t("settings.pro.restoreNone.title"),
          description: outcome.message || t("settings.pro.restoreNone.desc"),
          tone: "error",
        });
      }
    } finally {
      setRestoring(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      router.replace("/login");
    } catch (err) {
      console.error("[settings] 로그아웃 실패:", err);
    }
  };

  const handleDeleteAccount = async () => {
    setDeleting(true);
    try {
      const res = await authedFetch("/api/account/delete", { method: "DELETE" });
      if (!res.ok) {
        let serverMsg = "";
        try {
          const body = (await res.json()) as { error?: string };
          serverMsg = body?.error ?? "";
        } catch {}
        throw new Error(serverMsg || t("settings.account.delete.failed"));
      }
      await signOut().catch(() => {});
      router.replace("/login");
    } catch (err) {
      console.error("[settings] 계정 삭제 실패:", err);
      window.alert(err instanceof Error ? err.message : t("settings.account.delete.failed"));
      setDeleting(false);
    }
  };

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-[var(--bg-grouped)] pb-16">
      {/* Large Title nav */}
      <header className="pt-3 pb-2 bg-[var(--bg-grouped)]">
        <div className="mx-auto max-w-3xl px-2 min-h-[44px] flex items-center">
          <button
            type="button"
            onClick={() => router.push("/home")}
            aria-label={t("home.title")}
            className="inline-flex items-center gap-1 text-[var(--soul)] text-[17px] tracking-[-0.43px] px-1 py-2"
          >
            <IconBack />
            <span>{t("home.title")}</span>
          </button>
        </div>
        <div className="mx-auto max-w-3xl px-5">
          <h1 className="text-large-title font-display">{t("settings.title") || "설정"}</h1>
        </div>
      </header>

      {/* Profile hero card */}
      <div className="mx-4 mt-4 bg-[var(--bg-grouped-2)] rounded-[12px] p-4 flex items-center gap-4">
        <div
          className="w-14 h-14 rounded-full flex items-center justify-center text-white text-[22px] font-semibold tracking-[-0.5px]"
          style={{
            background:
              "linear-gradient(135deg, #1E1B4B 0%, #2A2766 100%)",
            boxShadow: "0 4px 12px rgba(88,86,214,0.25)",
          }}
        >
          {userInitial}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[17px] font-semibold tracking-[-0.43px] text-[var(--label)] truncate">
            {userName}
          </div>
          <div className="text-[13px] tracking-[-0.08px] text-[var(--label-2)] truncate">
            {userEmail}
          </div>
          {streakCount > 0 && (
            <div
              className="mt-1.5 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full"
              style={{ background: "rgba(255,149,0,0.16)" }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="#D85A30" aria-hidden>
                <path d="M13 2L4.5 13.5h6L9 22l8.5-11.5h-6L13 2z" />
              </svg>
              <span className="text-[12px] font-semibold tracking-[0.4px] text-[#D85A30]">
                {t("settings.streakLabel", { count: streakCount }) || `STREAK ${streakCount}일`}
              </span>
            </div>
          )}
        </div>
      </div>

      <main className="mx-auto w-full max-w-3xl">
        {/* 프로필 */}
        <GroupedSection header={t("settings.profile.header") || "프로필"}>
          <SettingsRow
            color="#1E1B4B"
            glyph={G.user}
            title={t("home.future.title")}
            detail={user?.futurePersona ? t("common.set") || "작성됨" : t("common.empty") || "비어있음"}
            onClick={() => setFutureOpen(true)}
          />
          <SettingsRow
            color="#D85A30"
            glyph={G.target}
            title={t("home.goals.title")}
            detail={`${goalCount}`}
            onClick={() => setGoalsOpen(true)}
          />
          <SettingsRow
            color="#D85A30"
            glyph={G.spark}
            title={t("settings.affirmations.header") || "성공한 나의 모습 다짐"}
            detail={`${affirmations.length}`}
            onClick={() => setAffirmationsOpen(true)}
          />
          <SettingsRow
            color="#FF9500"
            glyph={G.bolt}
            title={t("progress.title")}
            onClick={() => router.push("/progress")}
            isLast
          />
        </GroupedSection>

        {/* 실행 설계 (if-then) — 홈 "나의 행동" 탭과 동일 컴포넌트/시트 재사용 */}
        {firebaseUser && (
          <ExecutionPlansSection
            uid={firebaseUser.uid}
            goals={goals}
            identityLabels={user?.identities?.labels ?? []}
            plans={plans}
          />
        )}

        {/* 카드 환경설정 */}
        <GroupedSection header={t("settings.quote.header") || "카드"}>
          <SettingsRow
            color="#1E1B4B"
            glyph={G.book}
            title={t("settings.quote.pinnedAuthor") || "좋아하는 인물"}
            detail={pinnedAuthor || t("common.none") || "없음"}
            onClick={() => setAuthorOpen(true)}
          />
          <SettingsRow
            color="#1E1B4B"
            glyph={G.globe}
            title={t("settings.language.header") || "언어"}
            detail={LOCALE_META[locale]?.label || locale}
            onClick={() => setLanguageOpen(true)}
            isLast
          />
        </GroupedSection>

        {/* Anima Pro — iOS 인앱결제 (네이티브 플러그인이 있는 iOS 빌드에서만 노출) */}
        {showPro && (
          <GroupedSection
            header={t("settings.pro.header")}
            footer={
              proActive
                ? t("settings.pro.footerActive")
                : t("settings.pro.footerInactive")
            }
          >
            {proActive ? (
              <div className="relative flex items-center gap-3 px-4 min-h-[44px]">
                <div
                  className="w-[30px] h-[30px] rounded-[7px] flex items-center justify-center flex-shrink-0"
                  style={{ background: "#D85A30" }}
                >
                  {G.spark}
                </div>
                <div className="flex-1 py-[11px] text-[17px] leading-[22px] tracking-[-0.43px] text-[var(--label)]">
                  {t("settings.pro.active")}
                </div>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#34C759" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M5 12l5 5L20 7" />
                </svg>
                <div className="absolute bottom-0 right-0 h-[0.5px]" style={{ left: 58, background: "var(--sep)" }} />
              </div>
            ) : (
              <button
                type="button"
                onClick={handlePurchasePro}
                disabled={purchasing || restoring}
                className="w-full relative flex items-center gap-3 px-4 min-h-[44px] text-left disabled:opacity-50"
              >
                <div
                  className="w-[30px] h-[30px] rounded-[7px] flex items-center justify-center flex-shrink-0"
                  style={{ background: "#D85A30" }}
                >
                  {G.spark}
                </div>
                <div className="flex-1 py-[11px] text-[17px] leading-[22px] tracking-[-0.43px] text-[var(--soul)] font-semibold">
                  {purchasing ? t("settings.pro.processing") : t("settings.pro.buy")}
                </div>
                {proPrice && !purchasing && (
                  <span className="text-[17px] tracking-[-0.43px] text-[var(--label-2)]">{proPrice}</span>
                )}
                <div className="absolute bottom-0 right-0 h-[0.5px]" style={{ left: 58, background: "var(--sep)" }} />
              </button>
            )}

            <button
              type="button"
              onClick={handleRestorePro}
              disabled={purchasing || restoring}
              className="w-full flex items-center gap-3 px-4 min-h-[44px] text-left disabled:opacity-50"
            >
              <div
                className="w-[30px] h-[30px] rounded-[7px] flex items-center justify-center flex-shrink-0"
                style={{ background: "#8E8E93" }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
                  <path d="M3 4v4h4" />
                </svg>
              </div>
              <div className="flex-1 py-[11px] text-[17px] leading-[22px] tracking-[-0.43px] text-[var(--label)]">
                {restoring ? t("settings.pro.restoring") : t("settings.pro.restore")}
              </div>
            </button>
          </GroupedSection>
        )}

        {/* 계정 */}
        <GroupedSection header={t("settings.account.header") || "계정"}>
          <SettingsRow
            color="#8E8E93"
            glyph={G.out}
            title={t("auth.signOut") || "로그아웃"}
            onClick={handleSignOut}
          />
          <SettingsRow
            color="#FF3B30"
            glyph={G.trash}
            title={t("settings.account.delete") || "계정 영구 삭제"}
            destructive
            onClick={() => setDeleteOpen(true)}
            isLast
          />
        </GroupedSection>

        {/* 정보 */}
        <GroupedSection>
          <SettingsRow
            color="#8E8E93"
            glyph={G.shield}
            title={t("legal.privacy") || "개인정보처리방침"}
            onClick={() => router.push("/privacy")}
          />
          <SettingsRow
            color="#8E8E93"
            glyph={G.doc}
            title={t("legal.terms") || "이용약관"}
            onClick={() => router.push("/terms")}
            isLast
          />
        </GroupedSection>

        <div className="text-center pt-6 pb-2 text-[12px] tracking-[0.4px] text-[var(--label-3)] font-mono">
          Anima · v{process.env.NEXT_PUBLIC_APP_VERSION ?? "0.3.13"}
        </div>
      </main>

      {/* ── Future self sheet — 구조화 7문항 편집 + 초상 미리보기/재생성 ── */}
      {futureOpen && (
        <Sheet onClose={() => setFutureOpen(false)} title={t("home.future.title")}>
          <p className="mt-1 text-[13px] leading-[1.5] tracking-[-0.08px] text-[var(--label-2)]">
            {t("settings.future.subtitle")}
          </p>

          {/* 온보딩에서 묻는 것은 이 한 문항뿐 — 나머지 6개는 원하는 사람만 펼쳐서 채운다. */}
          <div className="mt-3 space-y-4">
            {(futureDetailOpen
              ? FUTURE_SELF_DIMENSIONS
              : [PRIMARY_FUTURE_DIMENSION]
            ).map((dim) => (
              <div key={dim}>
                <p className="text-[13px] font-semibold tracking-[-0.08px] text-[var(--label)]">
                  {t(FUTURE_Q_KEY[dim])}
                </p>
                <textarea
                  value={futureSelfDraft[dim] ?? ""}
                  onChange={(e) =>
                    setFutureSelfDraft((prev) => ({
                      ...prev,
                      [dim]: e.target.value.slice(0, FUTURE_SELF_FIELD_MAX),
                    }))
                  }
                  rows={3}
                  maxLength={FUTURE_SELF_FIELD_MAX}
                  placeholder={t(FUTURE_PH_KEY[dim])}
                  className="mt-1.5 w-full resize-none rounded-[12px] border border-[var(--sep)] bg-[var(--bg-grouped-2)] px-4 py-3 text-[15px] leading-[22px] tracking-[-0.24px] text-[var(--label)] placeholder:text-[var(--label-3)] focus:outline-none focus:border-[var(--soul)]"
                />
              </div>
            ))}
          </div>

          {!futureDetailOpen && (
            <button
              type="button"
              onClick={() => setFutureDetailOpen(true)}
              className="mt-3 text-[15px] font-medium text-[var(--soul)]"
            >
              ⌄ {t("settings.futureSelf.moreDetail")}
            </button>
          )}

          {/* 레거시 사용자: 구조화 답변 없이 futurePersona 원문만 있으면 읽기전용으로 노출 */}
          {!hasAnyFutureSelfAnswer(user?.futureSelfAnswers ?? {}) && user?.futurePersona && (
            <div className="mt-4 rounded-[12px] bg-[var(--bg-grouped-2)] px-4 py-3">
              <p className="text-[11px] font-medium tracking-[0.06em] text-[var(--label-3)]">
                {t("settings.futureSelf.legacyNote")}
              </p>
              <p className="mt-1.5 whitespace-pre-wrap text-[13px] leading-[1.55] tracking-[-0.08px] text-[var(--label-2)]">
                {user.futurePersona}
              </p>
            </div>
          )}

          {/* 저장된 초상 미리보기 + 다시 그리기 */}
          {user?.futureSelfPortrait && (
            <div className="mt-4 rounded-[12px] bg-[#1E1B4B] px-4 py-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/50">
                {t("futureSelf.portrait.headerLabel")}
              </p>
              <p className="mt-2 text-[15px] font-bold leading-[1.4] tracking-[-0.24px] text-white">
                {user.futureSelfPortrait.title}
              </p>
              <p className="mt-2 whitespace-pre-wrap text-[13px] leading-[1.6] tracking-[-0.08px] text-white/85">
                {user.futureSelfPortrait.portrait}
              </p>
              <button
                type="button"
                onClick={handleRegeneratePortrait}
                disabled={portraitRegenLoading || futureSaving}
                className="mt-3 rounded-full bg-white/12 px-4 py-1.5 text-[12px] font-semibold tracking-[-0.05px] text-white/90 transition-colors hover:bg-white/20 disabled:opacity-40"
              >
                {portraitRegenLoading
                  ? t("futureSelf.portrait.regenerating")
                  : t("futureSelf.portrait.regenerate")}
              </button>
            </div>
          )}

          <div className="flex justify-end mt-4">
            <button
              type="button"
              onClick={handleSaveFuture}
              disabled={futureSaving}
              className="text-[17px] font-semibold text-[var(--soul)] disabled:opacity-40"
            >
              {futureSaving ? t("common.saving") : t("common.save")}
            </button>
          </div>
        </Sheet>
      )}

      {/* ── Goals sheet ── */}
      {goalsOpen && (
        <Sheet onClose={() => setGoalsOpen(false)} title={t("home.goals.title")}>
          <div className="bg-[var(--bg-grouped-2)] rounded-[12px] overflow-hidden mt-2">
            {goals.map((g, i) => {
              const isLast = i === goals.length - 1;
              // 구체성 힌트는 조용히 — 점수가 낮을 때, 또는 홈 배너로 들어온 그 줄에만.
              const missing = missingGoalSignals(g);
              const showHint =
                missing.length > 0 && (refineIdx === i || needsMoreSpecificGoal(g));
              return (
                <div key={i} className="relative px-4 py-1">
                  <div className="flex items-center gap-3 min-h-[52px]">
                    <span className="text-[15px] font-bold w-7 text-center text-[#1E1B4B]">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <input
                      value={g}
                      maxLength={GOAL_TEXT_MAX}
                      autoFocus={refineIdx === i}
                      onChange={(e) =>
                        setGoals(goals.map((x, j) => (j === i ? e.target.value : x)))
                      }
                      className="flex-1 bg-transparent text-[17px] tracking-[-0.43px] text-[var(--label)] focus:outline-none py-2"
                    />
                    <button
                      type="button"
                      onClick={() => setGoals(goals.filter((_, j) => j !== i))}
                      className="text-[#FF3B30] text-[15px]"
                    >
                      ×
                    </button>
                  </div>

                  {showHint && (
                    <div className="pb-2.5 pl-10">
                      <p className="text-[12px] leading-[16px] tracking-[-0.05px] text-[var(--label-3)]">
                        {t("goal.specific.hint")}
                      </p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {missing.map((signal) => (
                          <span
                            key={signal}
                            className="inline-flex items-center gap-1 rounded-full bg-[#1E1B4B]/[0.06] px-2.5 py-1 text-[12px] tracking-[-0.05px] text-[#1E1B4B]/80"
                          >
                            {t(GOAL_SIGNAL_LABEL_KEY[signal])}
                            <span className="text-[var(--label-3)]">
                              {t(GOAL_SIGNAL_EXAMPLE_KEY[signal])}
                            </span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {!isLast && (
                    <div className="absolute bottom-0 left-[50px] right-0 h-[0.5px] bg-[var(--sep)]" />
                  )}
                </div>
              );
            })}

            {/* 잠긴 칸 — 왜 못 늘리는지, 언제 열리는지를 그 자리에서 보여준다. */}
            {goals.length >= goalSlots.unlocked &&
              goalSlots.unlocked < GOAL_SLOT_MAX &&
              goalSlots.nextThreshold !== null && (
                <div className="flex items-center gap-3 px-4 py-3 border-t border-[var(--sep)]">
                  <span className="w-7 text-center text-[15px]" aria-hidden>
                    🔒
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[15px] leading-[20px] tracking-[-0.24px] text-[var(--label-2)]">
                      {t("goalSlot.locked", { days: goalSlots.nextThreshold })}
                    </p>
                    <p className="mt-0.5 text-[13px] tracking-[-0.08px] text-[var(--label-3)]">
                      {t("goalSlot.lockedProgress", { progress: goalSlots.progress })}
                    </p>
                  </div>
                </div>
              )}

            {goals.length < goalSlots.unlocked && (
              <button
                type="button"
                onClick={() => setGoals([...goals, ""])}
                className="block w-full text-left px-4 py-3 text-[17px] text-[#D85A30]"
              >
                ＋ {t("common.add")}
              </button>
            )}
          </div>

          <p className="px-1 mt-2 text-[13px] leading-[18px] tracking-[-0.08px] text-[var(--label-2)]">
            {goalSlots.earned >= GOAL_SLOT_MAX && goals.length >= goalSlots.unlocked
              ? t("goalSlot.maxed", { max: GOAL_SLOT_MAX })
              : t("goalSlot.hint")}
          </p>

          <div className="flex justify-end mt-3">
            <button
              type="button"
              onClick={handleSaveGoals}
              className="text-[17px] font-semibold text-[var(--soul)]"
            >
              {t("common.save")}
            </button>
          </div>
        </Sheet>
      )}

      {/* ── Affirmations sheet — reuse AffirmationsEditor ── */}
      {affirmationsOpen && (
        <Sheet
          onClose={() => setAffirmationsOpen(false)}
          title={t("settings.affirmations.header") || "성공한 나의 모습 다짐"}
        >
          <div className="mt-2">
            <AffirmationsEditor
              value={affirmations}
              onChange={setAffirmations}
              max={MAX_SUCCESS_AFFIRMATIONS}
            />
          </div>
          <div className="flex justify-end mt-3">
            <button
              type="button"
              onClick={handleSaveAffirmations}
              disabled={affirmationsSaving}
              className="text-[17px] font-semibold text-[var(--soul)] disabled:opacity-40"
            >
              {affirmationsSaving ? t("common.saving") : t("common.save")}
            </button>
          </div>
        </Sheet>
      )}

      {/* ── Author sheet ── */}
      {authorOpen && (
        <Sheet onClose={() => setAuthorOpen(false)} title={t("settings.quote.pinnedAuthor") || "좋아하는 인물"}>
          <div className="mt-2 bg-[var(--bg-grouped-2)] rounded-[12px] overflow-hidden">
            <button
              type="button"
              onClick={() => setPinnedAuthor("")}
              className={`w-full px-4 py-3 text-left text-[17px] flex items-center justify-between ${
                pinnedAuthor === "" ? "text-[var(--soul)] font-semibold" : "text-[var(--label)]"
              }`}
            >
              <span>{t("common.none") || "없음"}</span>
              {pinnedAuthor === "" && (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#D85A30" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12l5 5L20 7" />
                </svg>
              )}
            </button>
            {authorGroups.flatMap((g) => g.authors).map((a, i, arr) => {
              const isLast = i === arr.length - 1;
              const selected = pinnedAuthor === a;
              return (
                <button
                  key={a}
                  type="button"
                  onClick={() => setPinnedAuthor(a)}
                  className={`w-full relative px-4 py-3 text-left text-[17px] flex items-center justify-between ${
                    selected ? "text-[var(--soul)] font-semibold" : "text-[var(--label)]"
                  }`}
                >
                  <span>{a}</span>
                  {selected && (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#D85A30" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12l5 5L20 7" />
                    </svg>
                  )}
                  {!isLast && (
                    <div className="absolute bottom-0 left-4 right-0 h-[0.5px] bg-[var(--sep)]" />
                  )}
                </button>
              );
            })}
          </div>
          <div className="flex justify-end mt-3">
            <button
              type="button"
              onClick={handleSaveQuotePreference}
              className="text-[17px] font-semibold text-[var(--soul)]"
            >
              {t("common.save")}
            </button>
          </div>
        </Sheet>
      )}

      {/* ── Language picker sheet ── */}
      {languageOpen && (
        <Sheet onClose={() => setLanguageOpen(false)} title={t("settings.language.header") || "언어"}>
          <div className="mt-2 bg-[var(--bg-grouped-2)] rounded-[12px] overflow-hidden">
            {SUPPORTED_LOCALES.map((code, i) => {
              const isLast = i === SUPPORTED_LOCALES.length - 1;
              const selected = locale === code;
              const meta = LOCALE_META[code];
              return (
                <button
                  key={code}
                  type="button"
                  disabled={languageSaving}
                  onClick={() => {
                    void handleChangeLanguage(code);
                    setLanguageOpen(false);
                  }}
                  className={`w-full relative px-4 py-3 text-left text-[17px] flex items-center gap-3 disabled:opacity-50 ${
                    selected ? "text-[var(--soul)] font-semibold" : "text-[var(--label)]"
                  }`}
                >
                  <span aria-hidden className="text-[20px] leading-none">{meta.flag}</span>
                  <span className="flex-1">{meta.nativeLabel}</span>
                  {selected && (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#D85A30" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12l5 5L20 7" />
                    </svg>
                  )}
                  {!isLast && (
                    <div className="absolute bottom-0 left-4 right-0 h-[0.5px] bg-[var(--sep)]" />
                  )}
                </button>
              );
            })}
          </div>
        </Sheet>
      )}

      {/* ── Delete account confirm sheet ── */}
      {deleteOpen && (
        <Sheet onClose={() => setDeleteOpen(false)} title={t("settings.account.delete") || "계정 영구 삭제"}>
          <p className="mt-2 text-[15px] leading-[20px] text-[var(--label-2)]">
            {t("settings.account.deleteConfirm") || "모든 데이터가 영구 삭제됩니다. 아래에 \"삭제\"를 입력해주세요."}
          </p>
          <input
            value={deleteConfirmText}
            onChange={(e) => setDeleteConfirmText(e.target.value)}
            placeholder={deleteKeyword}
            className="w-full mt-3 rounded-[12px] border border-[var(--sep)] bg-[var(--bg-grouped-2)] px-4 py-3 text-[17px] tracking-[-0.43px] text-[var(--label)] placeholder:text-[var(--label-3)] focus:outline-none focus:border-[#FF3B30]"
          />
          <button
            type="button"
            onClick={handleDeleteAccount}
            disabled={!deleteConfirmed || deleting}
            className="w-full mt-4 h-[50px] rounded-[12px] bg-[#FF3B30] text-white text-[17px] font-semibold disabled:opacity-30"
          >
            {deleting ? t("common.deleting") || "삭제하는 중..." : t("settings.account.delete") || "계정 영구 삭제"}
          </button>
        </Sheet>
      )}

      {/* ── 결제/복원 결과 안내 (window.alert 대체) ── */}
      <NoticeDialog
        open={proNotice !== null}
        title={proNotice?.title ?? ""}
        description={proNotice?.description}
        tone={proNotice?.tone}
        onClose={() => setProNotice(null)}
      />
    </div>
  );
}

