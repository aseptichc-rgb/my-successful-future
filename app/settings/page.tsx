"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth, fetchNativeBridgeToken } from "@/lib/auth-context";
import {
  updateNotificationPrefs,
  updateQuotePreference,
  updateUserLanguage,
} from "@/lib/firebase";
import { useClientValue } from "@/lib/useClientValue";
import { backOrReplace } from "@/lib/navigation";
import {
  DEFAULT_NOTIFICATION_PREFS,
  MORNING_HOUR_CHOICES,
  EVENING_HOUR_CHOICES,
  buildNotificationTexts,
  normalizeNotificationPrefs,
  summarizeNotificationHours,
} from "@/lib/notificationPolicy";
import { isIosNotificationAvailable, syncIosNotifications } from "@/lib/notificationBridge";
import { fetchNotificationContent } from "@/lib/notificationSync";
import type { NotificationPrefs } from "@/types";
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
import { detectPurchaseEnv } from "@/lib/purchaseEnv";
import {
  isAndroidApp,
  notifyAndroidPurchase,
  notifyAndroidRestore,
  notifyAndroidWidgetRefresh,
} from "@/lib/widgetBridge";
import { refreshIosWidget } from "@/lib/iosWidget";
import { getAllKnownAuthorsGrouped } from "@/lib/famousQuoteCatalog";
import NoticeDialog from "@/components/ui/NoticeDialog";
import GroupedSection from "@/components/ui/GroupedSection";
import Sheet from "@/components/ui/Sheet";
import BackButton from "@/components/nav/BackButton";
import { useLanguage, LOCALE_META, SUPPORTED_LOCALES, type Locale } from "@/lib/i18n";

/* ─────────────────────────────────────────────────────────────────
 * Settings — Apple iOS native redesign
 *  · Large Title nav with back button (탭 그룹 밖 — 헤더 톱니바퀴로 push 해 들어온다)
 *  · Profile card with gradient avatar + orange streak chip
 *  · Grouped Inset Lists with COLORED icon squares (Settings.app pattern)
 *  · Destructive actions in System Red
 *
 * 내 꿈·다짐·목표·실행 설계 편집은 내 꿈 탭(app/(tabs)/dream)으로 옮겨 갔다 — 여기엔
 * 카드(좋아하는 인물·언어)·알림·Pro·계정·약관만 남는다. 옛 `/settings?sheet=` 딥링크는
 * next.config redirects 가 `/dream?sheet=` 로 보낸다.
 * ───────────────────────────────────────────────────────────────── */

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
  bell: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="white" aria-hidden>
      <path d="M12 2a6 6 0 00-6 6v4l-2 4h16l-2-4V8a6 6 0 00-6-6z" />
      <path d="M10 19a2 2 0 004 0" />
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

/** 알림 시트의 토글 행 — 제목 + 설명 + iOS 스타일 스위치. */
function NotifToggleRow({
  title,
  desc,
  checked,
  onChange,
  isLast,
}: {
  title: string;
  desc: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  isLast?: boolean;
}) {
  return (
    <div className="relative flex items-center gap-3 px-4 py-3">
      <div className="flex-1 min-w-0">
        <div className="text-[17px] leading-[22px] tracking-[-0.43px] text-[var(--label)]">
          {title}
        </div>
        <div className="mt-0.5 text-[13px] tracking-[-0.08px] text-[var(--label-2)]">{desc}</div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={title}
        onClick={() => onChange(!checked)}
        className="relative flex-shrink-0 w-[51px] h-[31px] rounded-full transition-colors"
        style={{ background: checked ? "#34C759" : "var(--sep)" }}
      >
        <span
          className="absolute top-[2px] w-[27px] h-[27px] rounded-full bg-white transition-transform"
          style={{
            left: 2,
            transform: checked ? "translateX(20px)" : "translateX(0)",
            boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
          }}
        />
      </button>
      {!isLast && (
        <div className="absolute bottom-0 left-4 right-0 h-[0.5px] bg-[var(--sep)]" />
      )}
    </div>
  );
}

/** 알림 시트의 시각 선택 행 — 정시만 제공(lib/notificationPolicy 의 선택지). */
function NotifHourRow({
  label,
  hour,
  choices,
  onChange,
  isLast,
}: {
  label: string;
  hour: number;
  choices: ReadonlyArray<number>;
  onChange: (hour: number) => void;
  isLast?: boolean;
}) {
  // 레거시/비정상 값이 선택지 밖이면 그 값도 목록에 넣어 UI 가 현재 상태를 숨기지 않게 한다.
  const options = choices.includes(hour) ? choices : [...choices, hour].sort((a, b) => a - b);
  return (
    <div className="relative flex items-center gap-3 px-4 py-2.5">
      <div className="flex-1 text-[15px] tracking-[-0.23px] text-[var(--label-2)]">{label}</div>
      <select
        value={hour}
        onChange={(e) => onChange(Number(e.target.value))}
        className="text-[17px] tracking-[-0.43px] text-[var(--label)] bg-transparent text-right"
        aria-label={label}
      >
        {options.map((h) => (
          <option key={h} value={h}>
            {`${String(h).padStart(2, "0")}:00`}
          </option>
        ))}
      </select>
      {!isLast && (
        <div className="absolute bottom-0 left-4 right-0 h-[0.5px] bg-[var(--sep)]" />
      )}
    </div>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const { user, firebaseUser, loading: authLoading, signOut, refreshUser } = useAuth();
  const { t, locale, setLocale } = useLanguage();
  const [languageSaving, setLanguageSaving] = useState(false);

  const [pinnedAuthor, setPinnedAuthor] = useState<string>("");
  const [pinnedDays, setPinnedDays] = useState<number>(0);
  const [authorOpen, setAuthorOpen] = useState(false);

  const [notifPrefs, setNotifPrefs] = useState<NotificationPrefs>({
    ...DEFAULT_NOTIFICATION_PREFS,
  });
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifSaving, setNotifSaving] = useState(false);

  const [languageOpen, setLanguageOpen] = useState(false);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  // Anima Pro(iOS 인앱결제) — 네이티브 플러그인이 있는 iOS 빌드에서만 노출.
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
  // 홈 트라이얼 배너의 "업그레이드"(?pro=1) 딥링크가 도착하면 이 섹션으로 스크롤한다.
  const proSectionRef = useRef<HTMLDivElement | null>(null);
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

  // 언마운트 시 진행 중이던 결제/복원 폴링을 중단한다(백그라운드 폴링·토큰 스로틀 방지).
  useEffect(() => {
    return () => pollAbortRef.current?.abort();
  }, []);

  // iOS(StoreKit) / Android(네이티브 브릿지) 결제 가용 시: 섹션 노출 + 가격/권한 로드.
  //  · 안드로이드는 TWA 웹 Digital Goods 위임이 Android 13+ 에서 깨지므로(clientAppUnavailable)
  //    네이티브 브릿지 결제를 쓴다. 따라서 "앱 안(isAndroidApp)" 이기만 하면 섹션을 노출한다.
  //  · 섹션 노출 여부는 클라이언트 환경에서 파생한다(서버 렌더는 항상 숨김).
  const showPro = useClientValue(detectPurchaseEnv, false);

  useEffect(() => {
    if (!showPro) return;
    const iosOk = isIosPurchaseAvailable();
    const digitalGoodsOk = isAndroidPurchaseAvailable();
    const androidApp = isAndroidApp();
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
  }, [showPro, firebaseUser]);

  /* 프로필(user) → 편집 초안 하이드레이션 — 렌더 중 상태 조정 패턴. */
  const [hydratedUser, setHydratedUser] = useState<typeof user>(null);
  if (user && hydratedUser !== user) {
    setHydratedUser(user);
    setPinnedAuthor(user.quotePreference?.pinnedAuthor || "");
    setPinnedDays(user.quotePreference?.pinnedDaysPerWeek ?? 0);
    setNotifPrefs(normalizeNotificationPrefs(user.notificationPrefs));
  }

  /* 홈 트라이얼 배너의 "업그레이드"(?pro=1) 딥링크 — ANIMA PRO 섹션으로 스크롤한 뒤 쿼리를
     지운다. Pro 섹션은 결제 가능 환경(showPro)에서만 렌더되므로 showPro 가 참이 된 뒤에
     실행되도록 의존성에 건다(웹에서는 섹션이 없어 스크롤 없이 쿼리만 정리). */
  useEffect(() => {
    let url: URL;
    try {
      url = new URL(window.location.href);
    } catch {
      return; // URL 파싱 불가 — 스크롤 생략
    }
    if (url.searchParams.get("pro") !== "1") return;
    if (showPro) {
      // 커밋 직후 DOM 이 붙은 다음에 스크롤해야 위치가 정확하다.
      const raf = requestAnimationFrame(() => {
        try {
          proSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        } catch {
          /* smooth 미지원 구형 웹뷰 — 섹션은 이미 화면에 있다 */
        }
      });
      url.searchParams.delete("pro");
      try {
        window.history.replaceState({}, "", url.toString());
      } catch {
        /* 무시 — 쿼리만 남을 뿐 동작엔 영향 없음 */
      }
      return () => cancelAnimationFrame(raf);
    }
  }, [showPro]);

  const authorGroups = useMemo(() => getAllKnownAuthorsGrouped(locale), [locale]);

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

  const handleChangeLanguage = async (next: Locale) => {
    if (next === locale) return;
    notifyAndroidWidgetRefresh();
    setLocale(next);
    setLanguageSaving(true);
    try {
      await updateUserLanguage(uid, next);
      await refreshUser().catch(() => {});
      void refreshIosWidget();
    } catch (err) {
      console.error("[settings] 언어 저장 실패:", err);
      window.alert(t("common.saveFailed"));
    } finally {
      setLanguageSaving(false);
    }
  };

  const handleSaveQuotePreference = async () => {
    notifyAndroidWidgetRefresh();
    try {
      await updateQuotePreference(uid, {
        pinnedAuthor: pinnedAuthor.trim() || undefined,
        pinnedDaysPerWeek: pinnedDays || undefined,
      });
      await refreshUser().catch(() => {});
      void refreshIosWidget();
      setAuthorOpen(false);
    } catch (err) {
      console.error("[settings] 인물 저장 실패:", err);
      window.alert(t("common.saveFailed"));
    }
  };

  const handleSaveNotificationPrefs = async () => {
    notifyAndroidWidgetRefresh();
    setNotifSaving(true);
    try {
      await updateNotificationPrefs(uid, notifPrefs);
      await refreshUser().catch(() => {});
      void refreshIosWidget();
      // iOS: 네이티브 예약 동기화. 첫 활성화면 이 시점(저장이라는 가치 맥락)에 권한 요청이 뜬다.
      // Android 는 다음 위젯 refresh(포그라운드 복귀·정주기·알림 발화 시점)에 서버 응답으로 동기화.
      // todayGoalDone=false: 설정 화면은 오늘 진척도를 모른다 — 홈 방문 시 재동기화로 보정된다.
      //
      // 여기서도 알림 콘텐츠를 받아 오는 이유: sync 는 예약 전체를 재구성하므로, 정적 문구만
      // 넘기면 홈에서 실어 둔 "오늘의 명언" 문구가 저장 한 번에 지워지고 다음 홈 방문까지
      // 밋밋한 알림이 나간다. 실패하면 어차피 정적 폴백이라 결과를 기다리지 않는다.
      //
      // ⚠️ 반드시 iOS 에서만 fetch 한다. syncIosNotifications 는 iOS 밖에서 no-op 이라
      // 게이트가 없으면 웹/안드로이드 사용자가 알림 설정을 저장할 때마다 /api/widget/today 를
      // 한 번(저녁 이후엔 내일치까지 두 번) 헛으로 호출하고, 그 두 번째 호출은 서버에서
      // 내일 카드 Gemini 생성까지 트리거한다 — 결과는 그대로 버려진다.
      void (isIosNotificationAvailable()
        ? fetchNotificationContent().catch(() => null)
        : Promise.resolve(null)
      ).then((content) =>
        syncIosNotifications({
          prefs: notifPrefs,
          todayGoalDone: false,
          // 사용자가 방금 알림을 켜고 저장했다 — 권한 프롬프트에 가장 맥락 있는 순간.
          allowPrompt: true,
          texts: buildNotificationTexts(t, content),
        }),
      );
      setNotifOpen(false);
    } catch (err) {
      console.error("[settings] 알림 설정 저장 실패:", err);
      window.alert(t("common.saveFailed"));
    } finally {
      setNotifSaving(false);
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
      <header className="pb-2 pt-[calc(env(safe-area-inset-top)+12px)] bg-[var(--bg-grouped)]">
        <div className="mx-auto max-w-3xl px-2 min-h-[44px] flex items-center">
          {/* 왔던 탭으로 — 딥링크(?pro=1)로 곧장 열렸으면 오늘 탭으로. */}
          <BackButton label={t("nav.back")} onClick={() => backOrReplace(router, "/home")} />
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

        {/* 알림 — 정책은 lib/notificationPolicy 단일 소스 (하루 최대 2건, 한 일에는 침묵) */}
        <GroupedSection
          header={t("settings.notifications.header") || "알림"}
          footer={t("settings.notifications.footer")}
        >
          <SettingsRow
            color="#FF9500"
            glyph={G.bell}
            title={t("settings.notifications.row") || "데일리 리마인더"}
            detail={
              summarizeNotificationHours(notifPrefs) ?? (t("settings.notifications.off") || "꺼짐")
            }
            onClick={() => setNotifOpen(true)}
            isLast
          />
        </GroupedSection>

        {/* Anima Pro — iOS 인앱결제 (네이티브 플러그인이 있는 iOS 빌드에서만 노출) */}
        {showPro && (
          <div ref={proSectionRef} className="scroll-mt-4">
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
          </div>
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

      {/* ── Notification sheet — 리마인더 토글·시각 ── */}
      {notifOpen && (
        <Sheet
          onClose={() => setNotifOpen(false)}
          title={t("settings.notifications.row") || "데일리 리마인더"}
        >
          <div className="mt-2 bg-[var(--bg-grouped-2)] rounded-[12px] overflow-hidden">
            <NotifToggleRow
              title={t("settings.notifications.morning.title")}
              desc={t("settings.notifications.morning.desc")}
              checked={notifPrefs.morningEnabled}
              onChange={(next) => setNotifPrefs((p) => ({ ...p, morningEnabled: next }))}
            />
            {notifPrefs.morningEnabled && (
              <NotifHourRow
                label={t("settings.notifications.time")}
                hour={notifPrefs.morningHour}
                choices={MORNING_HOUR_CHOICES}
                onChange={(hour) => setNotifPrefs((p) => ({ ...p, morningHour: hour }))}
              />
            )}
            <NotifToggleRow
              title={t("settings.notifications.evening.title")}
              desc={t("settings.notifications.evening.desc")}
              checked={notifPrefs.eveningEnabled}
              onChange={(next) => setNotifPrefs((p) => ({ ...p, eveningEnabled: next }))}
            />
            {(notifPrefs.eveningEnabled || notifPrefs.weeklyReviewEnabled) && (
              <NotifHourRow
                label={t("settings.notifications.time")}
                hour={notifPrefs.eveningHour}
                choices={EVENING_HOUR_CHOICES}
                onChange={(hour) => setNotifPrefs((p) => ({ ...p, eveningHour: hour }))}
              />
            )}
            <NotifToggleRow
              title={t("settings.notifications.weekly.title")}
              desc={t("settings.notifications.weekly.desc")}
              checked={notifPrefs.weeklyReviewEnabled}
              onChange={(next) => setNotifPrefs((p) => ({ ...p, weeklyReviewEnabled: next }))}
            />
            {/*
              저녁 시각을 공유하지만 별도 토글로 둔다 — 이것만 끄고 싶은 사용자가
              리마인더 전체를 꺼 버리는 게 opt-out 의 가장 흔한 경로다.
            */}
            <NotifToggleRow
              title={t("settings.notifications.pending.title")}
              desc={t("settings.notifications.pending.desc")}
              checked={notifPrefs.pendingTaskEnabled}
              onChange={(next) => setNotifPrefs((p) => ({ ...p, pendingTaskEnabled: next }))}
              isLast
            />
          </div>
          <div className="flex justify-end mt-3">
            <button
              type="button"
              onClick={handleSaveNotificationPrefs}
              disabled={notifSaving}
              className="text-[17px] font-semibold text-[var(--soul)] disabled:opacity-40"
            >
              {notifSaving ? t("common.saving") : t("common.save")}
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

