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
  QUOTE_PINNED_DAYS_MAX,
} from "@/lib/firebase";
import { getAllKnownAuthorsGrouped } from "@/lib/famousQuoteCatalog";
import AffirmationsEditor from "@/components/affirmations/AffirmationsEditor";
import { useLanguage, LOCALE_META, SUPPORTED_LOCALES, type Locale } from "@/lib/i18n";

const FUTURE_PERSONA_MAX = 500;
const GOAL_MAX = 80;

export default function SettingsPage() {
  const router = useRouter();
  const { user, firebaseUser, loading: authLoading, signOut, refreshUser } = useAuth();
  const { t, locale, setLocale } = useLanguage();
  const [languageSaving, setLanguageSaving] = useState(false);

  const [futureDraft, setFutureDraft] = useState("");
  const [futureSaving, setFutureSaving] = useState(false);

  const [goals, setGoals] = useState<string[]>([]);
  const [goalsSaving, setGoalsSaving] = useState(false);

  const [pinnedAuthor, setPinnedAuthor] = useState<string>("");
  const [pinnedDays, setPinnedDays] = useState<number>(0);
  const [quoteSaving, setQuoteSaving] = useState(false);

  const [affirmations, setAffirmations] = useState<string[]>([]);
  const [affirmationsSaving, setAffirmationsSaving] = useState(false);
  const [affirmationsJustSaved, setAffirmationsJustSaved] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!firebaseUser) {
      router.replace("/login");
    }
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
  // 4개 언어 풀의 인물을 모두 노출 — 현재 언어 그룹이 첫 번째로 온다.
  // 시드에 없는 표기로 핀해도 dailyMotivation 의 free-author 경로가 처리.
  const authorGroups = useMemo(() => getAllKnownAuthorsGrouped(locale), [locale]);

  if (authLoading || !firebaseUser) {
    return (
      <div className="flex h-full items-center justify-center bg-[#F0EDE6]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-black/10 border-t-[#1E1B4B]" />
      </div>
    );
  }

  const uid = firebaseUser.uid;

  const handleSaveFuture = async () => {
    setFutureSaving(true);
    try {
      await updateFuturePersona(uid, futureDraft.trim().slice(0, FUTURE_PERSONA_MAX));
      await refreshUser().catch(() => {});
    } catch (err) {
      console.error("[settings] 미래의 나 저장 실패:", err);
      window.alert(t("common.saveFailed"));
    } finally {
      setFutureSaving(false);
    }
  };

  /**
   * 언어 변경 — 즉시 UI 에 반영하고 Firestore 에도 저장.
   * 다음 daily-motivation 호출부터 새 언어로 카드가 도착한다.
   */
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

  const handleAddGoalRow = () => {
    setGoals((prev) => (prev.length >= MAX_USER_GOALS ? prev : [...prev, ""]));
  };

  const handleGoalChange = (idx: number, value: string) => {
    setGoals((prev) => prev.map((g, i) => (i === idx ? value.slice(0, GOAL_MAX) : g)));
  };

  const handleRemoveGoalRow = (idx: number) => {
    setGoals((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSaveGoals = async () => {
    setGoalsSaving(true);
    try {
      const cleaned = goals.map((g) => g.trim()).filter((g) => g.length > 0);
      await updateUserGoals(uid, cleaned);
      await refreshUser().catch(() => {});
    } catch (err) {
      console.error("[settings] 목표 저장 실패:", err);
      window.alert(t("common.saveFailed"));
    } finally {
      setGoalsSaving(false);
    }
  };

  const handleSaveAffirmations = async () => {
    setAffirmationsSaving(true);
    setAffirmationsJustSaved(false);
    try {
      await updateSuccessAffirmations(uid, affirmations);
      await refreshUser().catch(() => {});
      setAffirmationsJustSaved(true);
      setTimeout(() => setAffirmationsJustSaved(false), 2000);
    } catch (err) {
      console.error("[settings] 다짐 저장 실패:", err);
      window.alert(t("common.saveFailed"));
    } finally {
      setAffirmationsSaving(false);
    }
  };

  const handleSaveQuotePreference = async () => {
    setQuoteSaving(true);
    try {
      await updateQuotePreference(uid, {
        pinnedAuthor: pinnedAuthor.trim() || undefined,
        pinnedDaysPerWeek: pinnedDays || undefined,
      });
      await refreshUser().catch(() => {});
    } catch (err) {
      console.error("[settings] 명언 큐레이션 저장 실패:", err);
      window.alert(t("common.saveFailed"));
    } finally {
      setQuoteSaving(false);
    }
  };

  return (
    <div className="flex h-full flex-col bg-[#F0EDE6]">
      <header className="border-b border-black/[0.06] bg-white px-5 py-5 sm:px-6 sm:py-7">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4">
          <div>
            <h1 className="text-[28px] font-semibold leading-[1.14] tracking-[-0.005em] text-[#1E1B4B] sm:text-[32px]">
              {t("settings.title")}
            </h1>
            <p className="mt-2 text-[15px] leading-[1.47] tracking-[-0.022em] text-black/60">
              {t("settings.subtitle")}
            </p>
          </div>
          <button
            type="button"
            onClick={() => router.push("/home")}
            className="shrink-0 rounded-pill bg-[#F0EDE6] px-4 py-2 text-[13px] font-medium text-black/70 transition-colors hover:bg-black/[0.06]"
          >
            {t("common.close")}
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-5 py-8 sm:px-6">
        <div className="mx-auto max-w-3xl space-y-4">
          {/* 언어 */}
          <section className="rounded-[18px] bg-white p-5 shadow-apple">
            <h2 className="text-[16px] font-semibold tracking-[-0.022em] text-[#1E1B4B]">
              {t("language.settings.title")}
            </h2>
            <p className="mt-1 text-[12px] tracking-[-0.01em] text-black/56">
              {t("language.settings.subtitle")}
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {SUPPORTED_LOCALES.map((code) => {
                const meta = LOCALE_META[code];
                const selected = locale === code;
                return (
                  <button
                    key={code}
                    type="button"
                    disabled={languageSaving}
                    onClick={() => handleChangeLanguage(code)}
                    className={`flex items-center gap-3 rounded-[12px] border px-3 py-2.5 text-left transition-all disabled:cursor-not-allowed disabled:opacity-60 ${
                      selected
                        ? "border-[#1E1B4B] bg-[#1E1B4B]/[0.04]"
                        : "border-black/10 bg-white hover:border-[#1E1B4B]/40"
                    }`}
                  >
                    <span className="text-[20px] leading-none" aria-hidden>{meta.flag}</span>
                    <span className="min-w-0">
                      <p className="truncate text-[14px] font-semibold tracking-[-0.015em] text-[#1E1B4B]">
                        {meta.nativeLabel}
                      </p>
                      <p className="truncate text-[11px] tracking-[-0.005em] text-black/55">
                        {meta.englishLabel}
                      </p>
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="mt-3 text-[11px] tracking-[-0.01em] text-black/48">
              {t("language.settings.note")}
            </p>
          </section>

          {/* 10년 후의 나 */}
          <section className="rounded-[18px] bg-white p-5 shadow-apple">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-[16px] font-semibold tracking-[-0.022em] text-[#1E1B4B]">
                {t("settings.future.title")}
              </h2>
              <span className="text-[11px] tracking-[-0.01em] text-black/40">
                {futureDraft.length}/{FUTURE_PERSONA_MAX}
              </span>
            </div>
            <p className="mt-1 text-[12px] tracking-[-0.01em] text-black/56">
              {t("settings.future.subtitle")}
            </p>
            <textarea
              value={futureDraft}
              onChange={(e) => setFutureDraft(e.target.value.slice(0, FUTURE_PERSONA_MAX))}
              rows={6}
              maxLength={FUTURE_PERSONA_MAX}
              placeholder={t("onboarding.step1.placeholder")}
              className="mt-3 w-full resize-none rounded-[12px] border border-black/10 bg-white px-3 py-2.5 text-[14px] leading-[1.6] tracking-[-0.01em] text-[#1E1B4B] placeholder:text-black/40 focus:border-[#1E1B4B] focus:outline-none"
            />
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={handleSaveFuture}
                disabled={futureSaving}
                className="rounded-pill bg-[#1E1B4B] px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-[#2A2766] disabled:opacity-50"
              >
                {futureSaving ? t("common.saving") : t("common.save")}
              </button>
            </div>
          </section>

          {/* 성공한 나에게 한 발 더 — 매일 새기는 다짐 */}
          <section className="rounded-[18px] bg-white p-5 shadow-apple">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-[16px] font-semibold tracking-[-0.022em] text-[#1E1B4B]">
                {t("settings.affirmations.title")}
              </h2>
              <span className="text-[11px] tracking-[-0.01em] text-black/40">
                {affirmations.length}/{MAX_SUCCESS_AFFIRMATIONS}
              </span>
            </div>
            <p className="mt-1 text-[12px] tracking-[-0.01em] text-black/56">
              {t("settings.affirmations.subtitle")}
            </p>

            <div className="mt-4">
              <AffirmationsEditor
                value={affirmations}
                onChange={setAffirmations}
                disabled={affirmationsSaving}
              />
            </div>

            <div className="mt-3 flex items-center justify-end gap-3">
              {affirmationsJustSaved && (
                <span className="flex items-center gap-1 text-[12px] tracking-[-0.01em] text-emerald-600">
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12l5 5L20 7" />
                  </svg>
                  {t("common.saved")}
                </span>
              )}
              <button
                type="button"
                onClick={handleSaveAffirmations}
                disabled={affirmationsSaving}
                className="rounded-pill bg-[#1E1B4B] px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-[#2A2766] disabled:opacity-50"
              >
                {affirmationsSaving ? t("common.saving") : t("common.save")}
              </button>
            </div>
          </section>

          {/* 목표를 이루기 위한 오늘의 행동 */}
          <section className="rounded-[18px] bg-white p-5 shadow-apple">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-[16px] font-semibold tracking-[-0.022em] text-[#1E1B4B]">
                {t("settings.goals.title")}
              </h2>
              <span className="text-[11px] tracking-[-0.01em] text-black/40">
                {goalCount}/{MAX_USER_GOALS}
              </span>
            </div>
            <p className="mt-1 text-[12px] tracking-[-0.01em] text-black/56">
              {t("settings.goals.subtitle")}
            </p>

            {goals.length === 0 ? (
              <p className="mt-4 rounded-[10px] border border-dashed border-black/15 bg-[#F7F4ED] px-3 py-3 text-center text-[12px] text-black/50">
                {t("settings.goals.empty")}
              </p>
            ) : (
              <ul className="mt-4 space-y-2">
                {goals.map((goal, idx) => (
                  <li key={idx} className="flex items-center gap-2">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#1E1B4B]/10 text-[12px] font-semibold text-[#1E1B4B]">
                      {idx + 1}
                    </span>
                    <input
                      value={goal}
                      maxLength={GOAL_MAX}
                      onChange={(e) => handleGoalChange(idx, e.target.value)}
                      className="min-w-0 flex-1 rounded-[10px] border border-black/10 bg-white px-3 py-2 text-[14px] tracking-[-0.01em] text-[#1E1B4B] focus:border-[#1E1B4B] focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveGoalRow(idx)}
                      aria-label={t("onboarding.step2.removeGoalAria")}
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-black/40 transition-colors hover:bg-black/[0.04] hover:text-black/80"
                    >
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 6L6 18M6 6l12 12" />
                      </svg>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-3 flex items-center justify-between gap-2">
              {goals.length < MAX_USER_GOALS ? (
                <button
                  type="button"
                  onClick={handleAddGoalRow}
                  className="rounded-pill border border-dashed border-black/15 bg-white px-3 py-1.5 text-[12px] font-medium tracking-[-0.01em] text-black/60 transition-colors hover:border-[#1E1B4B] hover:text-[#1E1B4B]"
                >
                  {t("onboarding.step2.addGoal")}
                </button>
              ) : <span />}
              <button
                type="button"
                onClick={handleSaveGoals}
                disabled={goalsSaving}
                className="rounded-pill bg-[#1E1B4B] px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-[#2A2766] disabled:opacity-50"
              >
                {goalsSaving ? t("common.saving") : t("common.save")}
              </button>
            </div>
          </section>

          {/* 오늘의 명언 큐레이션 */}
          <section className="rounded-[18px] bg-white p-5 shadow-apple">
            <h2 className="text-[16px] font-semibold tracking-[-0.022em] text-[#1E1B4B]">
              {t("settings.quote.title")}
            </h2>
            <p className="mt-1 text-[12px] tracking-[-0.01em] text-black/56">
              {t("settings.quote.subtitle")}
            </p>

            <label className="mt-4 block text-[12px] font-semibold tracking-[-0.01em] text-black/70">
              {t("settings.quote.pinAuthor")}
            </label>
            <select
              value={pinnedAuthor}
              onChange={(e) => setPinnedAuthor(e.target.value)}
              className="mt-1.5 w-full rounded-[10px] border border-black/10 bg-white px-3 py-2 text-[14px] tracking-[-0.01em] text-[#1E1B4B] focus:border-[#1E1B4B] focus:outline-none"
            >
              <option value="">{t("settings.quote.noPin")}</option>
              {authorGroups.map((group) => (
                <optgroup key={group.language} label={LOCALE_META[group.language].nativeLabel}>
                  {group.authors.map((name) => (
                    <option key={`${group.language}:${name}`} value={name}>{name}</option>
                  ))}
                </optgroup>
              ))}
            </select>

            <label className="mt-4 block text-[12px] font-semibold tracking-[-0.01em] text-black/70">
              {t("settings.quote.daysLabel")} <span className="font-bold text-[#1E1B4B]">{pinnedDays === 0 ? t("settings.quote.daysOff") : pinnedDays === QUOTE_PINNED_DAYS_MAX ? t("settings.quote.daysEveryday") : t("settings.quote.daysPerWeek", { n: pinnedDays })}</span>
            </label>
            <input
              type="range"
              min={0}
              max={QUOTE_PINNED_DAYS_MAX}
              step={1}
              value={pinnedDays}
              onChange={(e) => setPinnedDays(parseInt(e.target.value, 10))}
              className="mt-2 w-full"
            />

            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={handleSaveQuotePreference}
                disabled={quoteSaving}
                className="rounded-pill bg-[#1E1B4B] px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-[#2A2766] disabled:opacity-50"
              >
                {quoteSaving ? t("common.saving") : t("common.save")}
              </button>
            </div>
          </section>

          {/* 계정 */}
          <section className="rounded-[18px] bg-white p-5 shadow-apple">
            <h2 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-black/48">{t("settings.account.title")}</h2>
            <div className="mt-3 flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-medium tracking-[-0.022em] text-[#1E1B4B]">
                  {user?.displayName || "—"}
                </p>
                <p className="truncate text-[12px] tracking-[-0.01em] text-black/56">
                  {user?.email || firebaseUser.email || "—"}
                </p>
              </div>
              <button
                type="button"
                onClick={async () => {
                  await signOut();
                  router.push("/login");
                }}
                className="shrink-0 rounded-pill border border-black/10 px-4 py-2 text-[13px] font-medium text-black/70 transition-colors hover:bg-black/[0.04]"
              >
                {t("settings.account.signOut")}
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
