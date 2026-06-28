"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import {
  updateFuturePersona,
  updateUserGoals,
  updateQuotePreference,
  updateSuccessAffirmations,
  updateUserLanguage,
  MAX_USER_GOALS,
  MAX_SUCCESS_AFFIRMATIONS,
} from "@/lib/firebase";
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
import { useLanguage, LOCALE_META, SUPPORTED_LOCALES, type Locale } from "@/lib/i18n";

/* ─────────────────────────────────────────────────────────────────
 * Settings — Apple iOS native redesign
 *  · Large Title nav with back button
 *  · Profile card with gradient avatar + orange streak chip
 *  · Grouped Inset Lists with COLORED icon squares (Settings.app pattern)
 *  · Destructive actions in System Red
 * ───────────────────────────────────────────────────────────────── */

const FUTURE_PERSONA_MAX = 500;
const GOAL_MAX = 80;

/**
 * 네이티브 결제 브릿지(anima://purchase)는 서버가 해당 uid 에 paid claim 을 박는 것으로 완료된다.
 * 웹은 같은 uid 이므로 getIdToken(true) 강제 갱신으로 새 claim 을 감지한다(별도 토큰 전달 불필요).
 * 결제 시트/브릿지 동안 document 는 hidden → 복귀 시 visible 이 되므로, 복귀 후에도 권한이
 * 안 잡히면(여러 번 폴링) 취소로 간주해 무한 대기를 막는다.
 */
async function waitForNativeEntitlement(
  user: { getIdTokenResult: (force?: boolean) => Promise<{ claims: Record<string, unknown> }> },
  { maxMs = 120_000, intervalMs = 2_500 }: { maxMs?: number; intervalMs?: number } = {},
): Promise<boolean> {
  const start = Date.now();
  let sawHidden = false;
  let pollsAfterReturn = 0;
  while (Date.now() - start < maxMs) {
    try {
      const tr = await user.getIdTokenResult(true);
      const ent = readEntitlement(tr.claims);
      if (ent.kind === "lifetime" || ent.kind === "subscription") return true;
    } catch {
      // 토큰 갱신 일시 실패 — 다음 폴링에서 재시도.
    }
    if (typeof document !== "undefined") {
      if (document.visibilityState === "hidden") sawHidden = true;
      else if (sawHidden) pollsAfterReturn += 1;
    }
    // 결제 시트/브릿지에서 돌아왔는데(visible) 여러 번 폴링해도 권한이 없으면 취소로 간주.
    if (sawHidden && pollsAfterReturn >= 4) return false;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return false;
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

function GroupedSection({
  header,
  footer,
  children,
}: {
  header?: string;
  footer?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-7">
      {header && (
        <div className="px-7 mb-1.5 text-[13px] uppercase tracking-[-0.08px] text-[var(--label-2)]">
          {header}
        </div>
      )}
      <div className="mx-4 bg-[var(--bg-grouped-2)] rounded-[12px] overflow-hidden">{children}</div>
      {footer && (
        <p className="px-7 mt-1.5 text-[13px] tracking-[-0.08px] text-[var(--label-2)]">{footer}</p>
      )}
    </div>
  );
}

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

  const [futureDraft, setFutureDraft] = useState("");
  const [futureSaving, setFutureSaving] = useState(false);
  const [futureOpen, setFutureOpen] = useState(false);

  const [goals, setGoals] = useState<string[]>([]);
  const [goalsOpen, setGoalsOpen] = useState(false);

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
    })();
    return () => {
      cancelled = true;
    };
  }, [firebaseUser]);

  useEffect(() => {
    if (!user) return;
    setFutureDraft(user.futurePersona || "");
    setGoals(user.goals && user.goals.length > 0 ? [...user.goals] : []);
    setPinnedAuthor(user.quotePreference?.pinnedAuthor || "");
    setPinnedDays(user.quotePreference?.pinnedDaysPerWeek ?? 0);
    setAffirmations(
      user.successAffirmations && user.successAffirmations.length > 0
        ? [...user.successAffirmations]
        : [],
    );
  }, [user]);

  const goalCount = useMemo(() => goals.filter((g) => g.trim().length > 0).length, [goals]);
  const authorGroups = useMemo(() => getAllKnownAuthorsGrouped(locale), [locale]);

  if (authLoading || !firebaseUser) {
    return (
      <div className="flex h-full items-center justify-center bg-[var(--bg-grouped)]">
        <div className="h-6 w-6 animate-spin rounded-full border-[1.5px] border-black/10 border-t-[#D85A30]" />
      </div>
    );
  }

  const uid = firebaseUser.uid;
  const streakCount = user?.affirmationStreak?.count ?? 0;
  const userInitial = (user?.displayName || user?.email || "?").trim().charAt(0).toUpperCase();
  const userName = user?.displayName || user?.email?.split("@")[0] || "—";
  const userEmail = user?.email || "";

  const handleSaveFuture = async () => {
    setFutureSaving(true);
    try {
      await updateFuturePersona(uid, futureDraft.trim().slice(0, FUTURE_PERSONA_MAX));
      await refreshUser().catch(() => {});
      setFutureOpen(false);
    } catch (err) {
      console.error("[settings] 미래의 나 저장 실패:", err);
      window.alert(t("common.saveFailed"));
    } finally {
      setFutureSaving(false);
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

  const handleSaveGoals = async () => {
    try {
      const cleaned = goals.map((g) => g.trim()).filter((g) => g.length > 0);
      await updateUserGoals(uid, cleaned);
      await refreshUser().catch(() => {});
      setGoalsOpen(false);
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
    setPurchasing(true);
    try {
      // 안드로이드 앱(TWA): 웹 Digital Goods 위임이 Android 13+ 에서 깨지므로 네이티브 결제 브릿지로.
      //  브릿지가 결제→서버검증→paid claim 부여까지 하면, 같은 uid 인 웹은 토큰 강제갱신으로 감지한다.
      if (isAndroidApp() && !isIosPurchaseAvailable()) {
        notifyAndroidPurchase();
        const ok = firebaseUser ? await waitForNativeEntitlement(firebaseUser) : false;
        if (ok) {
          setProActive(true);
          setProNotice({
            title: t("settings.pro.purchaseDone.title"),
            description: t("settings.pro.purchaseDone.desc"),
            tone: "success",
          });
        }
        // 미완료(취소/대기)는 조용히 종료 — 결제됐다면 다음 진입 시 권한이 자동 반영된다.
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
    setRestoring(true);
    try {
      // 안드로이드 앱(TWA): 네이티브 브릿지로 보유 영수증 재검증(결제 시트 없이).
      if (isAndroidApp() && !isIosPurchaseAvailable()) {
        notifyAndroidRestore();
        const ok = firebaseUser ? await waitForNativeEntitlement(firebaseUser, { maxMs: 30_000 }) : false;
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
            isLast
          />
        </GroupedSection>

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
                disabled={purchasing}
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
              disabled={restoring}
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
          Anima · v1.0.0
        </div>
      </main>

      {/* ── Future persona sheet ── */}
      {futureOpen && (
        <Sheet onClose={() => setFutureOpen(false)} title={t("home.future.title")}>
          <textarea
            value={futureDraft}
            onChange={(e) => setFutureDraft(e.target.value)}
            rows={6}
            maxLength={FUTURE_PERSONA_MAX}
            placeholder={t("onboarding.step1.placeholder")}
            className="w-full mt-2 resize-none rounded-[12px] border border-[var(--sep)] bg-[var(--bg-grouped-2)] px-4 py-3 text-[17px] leading-[24px] tracking-[-0.43px] text-[var(--label)] placeholder:text-[var(--label-3)] focus:outline-none focus:border-[var(--soul)]"
          />
          <div className="flex justify-between mt-3">
            <span className="text-[12px] text-[var(--label-3)]">
              {futureDraft.length}/{FUTURE_PERSONA_MAX}
            </span>
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
              return (
                <div
                  key={i}
                  className="relative flex items-center gap-3 px-4 min-h-[52px]"
                >
                  <span className="text-[15px] font-bold w-7 text-center text-[#1E1B4B]">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <input
                    value={g}
                    maxLength={GOAL_MAX}
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
                  {!isLast && (
                    <div className="absolute bottom-0 left-[50px] right-0 h-[0.5px] bg-[var(--sep)]" />
                  )}
                </div>
              );
            })}
            {goals.length < MAX_USER_GOALS && (
              <button
                type="button"
                onClick={() => setGoals([...goals, ""])}
                className="block w-full text-left px-4 py-3 text-[17px] text-[#D85A30]"
              >
                ＋ {t("common.add")}
              </button>
            )}
          </div>
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
            placeholder="삭제"
            className="w-full mt-3 rounded-[12px] border border-[var(--sep)] bg-[var(--bg-grouped-2)] px-4 py-3 text-[17px] tracking-[-0.43px] text-[var(--label)] placeholder:text-[var(--label-3)] focus:outline-none focus:border-[#FF3B30]"
          />
          <button
            type="button"
            onClick={handleDeleteAccount}
            disabled={deleteConfirmText.trim() !== "삭제" || deleting}
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

/* ─────────────────────────────────────────────────────────────
 * Sheet — bottom sheet modal (iOS pattern)
 *   Backdrop dim · rounded top corners · handle · safe area bottom
 * ───────────────────────────────────────────────────────────── */
function Sheet({
  onClose,
  title,
  children,
}: {
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  const { t } = useLanguage();
  return (
    <div className="fixed inset-0 z-50 flex flex-col">
      <button
        type="button"
        onClick={onClose}
        aria-label="close"
        className="flex-1 bg-black/40"
      />
      <div className="bg-[var(--bg-grouped)] rounded-t-[14px] pb-8 safe-pb max-h-[90vh] overflow-y-auto">
        <div className="flex justify-center pt-2.5 pb-3">
          <div className="w-9 h-[5px] rounded-full bg-[#C7C7CC]" />
        </div>
        <div className="flex items-center justify-between px-4 pb-3">
          <button
            type="button"
            onClick={onClose}
            className="text-[17px] tracking-[-0.43px] text-[var(--soul)]"
          >
            {t("common.cancel")}
          </button>
          <span className="text-[17px] font-semibold tracking-[-0.43px] text-[var(--label)]">{title}</span>
          <div className="w-12" />
        </div>
        <div className="px-4">{children}</div>
      </div>
    </div>
  );
}
