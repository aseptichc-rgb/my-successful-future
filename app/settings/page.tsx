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
import { getAllKnownAuthorsGrouped } from "@/lib/famousQuoteCatalog";
import AffirmationsEditor from "@/components/affirmations/AffirmationsEditor";
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
        style={{ color: destructive ? "#FF3B30" : "#000" }}
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

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!firebaseUser) router.replace("/login");
  }, [authLoading, firebaseUser, router]);

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
        <div className="h-6 w-6 animate-spin rounded-full border-[1.5px] border-black/10 border-t-[#007AFF]" />
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
              "linear-gradient(135deg, #007AFF 0%, #5856D6 60%, #AF52DE 100%)",
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
              <svg width="11" height="11" viewBox="0 0 24 24" fill="#FF9500" aria-hidden>
                <path d="M13 2L4.5 13.5h6L9 22l8.5-11.5h-6L13 2z" />
              </svg>
              <span className="text-[12px] font-semibold tracking-[0.4px] text-[#FF9500]">
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
            color="#5856D6"
            glyph={G.user}
            title={t("home.future.title")}
            detail={user?.futurePersona ? t("common.set") || "작성됨" : t("common.empty") || "비어있음"}
            onClick={() => setFutureOpen(true)}
          />
          <SettingsRow
            color="#34C759"
            glyph={G.target}
            title={t("home.goals.title")}
            detail={`${goalCount}`}
            onClick={() => setGoalsOpen(true)}
          />
          <SettingsRow
            color="#FF9500"
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
            color="#AF52DE"
            glyph={G.book}
            title={t("settings.quote.pinnedAuthor") || "좋아하는 인물"}
            detail={pinnedAuthor || t("common.none") || "없음"}
            onClick={() => setAuthorOpen(true)}
          />
          <SettingsRow
            color="#32ADE6"
            glyph={G.globe}
            title={t("settings.language.header") || "언어"}
            detail={LOCALE_META[locale]?.label || locale}
            onClick={() => {
              const next: Locale = locale === "ko" ? "en" : "ko";
              void handleChangeLanguage(next);
            }}
            isLast
          />
        </GroupedSection>

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
                  <span className="text-[15px] font-bold w-7 text-center text-[#5856D6]">
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
                className="block w-full text-left px-4 py-3 text-[17px] text-[#34C759]"
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
            취소
          </button>
          <span className="text-[17px] font-semibold tracking-[-0.43px] text-[var(--label)]">{title}</span>
          <div className="w-12" />
        </div>
        <div className="px-4">{children}</div>
      </div>
    </div>
  );
}
