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
import { authedFetch } from "@/lib/authedFetch";
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

  // 계정 삭제 — 모달 열림 / 입력 키워드 / 삭제 진행
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

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

  /**
   * 계정 영구 삭제 — 서버가 Firestore 데이터와 Firebase Auth 사용자를 함께 정리한다.
   *
   * 흐름:
   *   1) DELETE /api/account/delete (Bearer 토큰)
   *   2) 성공 시 클라 signOut (이미 서버에서 user 가 삭제됐을 수 있어 실패 무시)
   *   3) /login 으로 이동
   *
   * 사용자가 "삭제" 키워드를 입력해야만 confirm 버튼이 활성화된다 — 오발화 차단.
   */
  const handleDeleteAccount = async () => {
    setDeleting(true);
    try {
      const res = await authedFetch("/api/account/delete", { method: "DELETE" });
      if (!res.ok) {
        // 본문이 JSON 이 아닐 가능성을 방어 — 그래도 사용자에겐 friendly 메시지.
        let serverMsg = "";
        try {
          const body = (await res.json()) as { error?: string };
          serverMsg = body?.error ?? "";
        } catch {
          /* ignore */
        }
        throw new Error(serverMsg || t("settings.account.delete.failed"));
      }
      // 클라 측 Firebase 세션 정리. 이미 user 가 사라져 onIdTokenChanged 로 자동 sign-out 됐을 수도 있음.
      await signOut().catch(() => {});
      router.replace("/login");
    } catch (err) {
      console.error("[settings] 계정 삭제 실패:", err);
      window.alert(
        err instanceof Error ? err.message : t("settings.account.delete.failed"),
      );
      setDeleting(false);
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

          {/* 언어 */}
          <section className="rounded-[18px] bg-white p-5 shadow-apple">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h2 className="text-[16px] font-semibold tracking-[-0.022em] text-[#1E1B4B]">
                  {t("language.settings.title")}
                </h2>
                <p className="mt-1 text-[12px] tracking-[-0.01em] text-black/56">
                  {t("language.settings.subtitle")}
                </p>
              </div>
              <select
                value={locale}
                disabled={languageSaving}
                onChange={(e) => handleChangeLanguage(e.target.value as Locale)}
                aria-label={t("language.settings.title")}
                className="shrink-0 rounded-[10px] border border-black/10 bg-white px-3 py-2 text-[14px] tracking-[-0.01em] text-[#1E1B4B] focus:border-[#1E1B4B] focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
              >
                {SUPPORTED_LOCALES.map((code) => {
                  const meta = LOCALE_META[code];
                  return (
                    <option key={code} value={code}>
                      {meta.flag} {meta.nativeLabel}
                    </option>
                  );
                })}
              </select>
            </div>
            <p className="mt-3 text-[11px] tracking-[-0.01em] text-black/48">
              {t("language.settings.note")}
            </p>
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

            {/*
              Google Play 정책상 앱 내에서 계정 삭제 진입이 반드시 있어야 한다.
              실수 삭제 방지를 위해 사용자가 키워드를 정확히 입력해야 확인 버튼이 활성화된다.
            */}
            <div className="mt-4 border-t border-black/[0.06] pt-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold tracking-[-0.015em] text-red-600">
                    {t("settings.account.delete")}
                  </p>
                  <p className="mt-1 text-[12px] tracking-[-0.01em] text-black/56">
                    {t("settings.account.delete.subtitle")}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setDeleteConfirmText("");
                    setDeleteOpen(true);
                  }}
                  className="shrink-0 rounded-pill border border-red-200 px-4 py-2 text-[13px] font-medium text-red-600 transition-colors hover:bg-red-50"
                >
                  {t("settings.account.delete")}
                </button>
              </div>
            </div>

            {/* 법적 고지 — Play 심사자가 앱 내에서도 찾을 수 있도록 노출. */}
            <div className="mt-4 flex items-center gap-3 border-t border-black/[0.06] pt-4 text-[12px] tracking-[-0.01em] text-black/56">
              <a href="/privacy" target="_blank" rel="noopener noreferrer" className="hover:text-[#1E1B4B]">
                개인정보 처리방침
              </a>
              <span aria-hidden>·</span>
              <a href="/terms" target="_blank" rel="noopener noreferrer" className="hover:text-[#1E1B4B]">
                이용약관
              </a>
            </div>
          </section>
        </div>
      </div>

      {/*
        삭제 확인 모달. 키워드 입력이 정확히 일치할 때만 확정 버튼이 활성화된다.
        삭제 진행 중에는 닫기/취소 차단 — 부분 삭제 상태로 모달이 닫히는 케이스 방지.
      */}
      {deleteOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-5"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-account-title"
        >
          <div className="w-full max-w-md rounded-[20px] bg-white p-6 shadow-2xl">
            <h3
              id="delete-account-title"
              className="text-[18px] font-semibold tracking-[-0.022em] text-[#1E1B4B]"
            >
              {t("settings.account.delete.confirmTitle")}
            </h3>
            <p className="mt-3 whitespace-pre-line text-[13px] leading-[1.6] tracking-[-0.01em] text-black/64">
              {t("settings.account.delete.confirmBody")}
            </p>

            <label className="mt-5 block text-[12px] font-semibold tracking-[-0.01em] text-black/70">
              {t("settings.account.delete.confirmInputLabel")}
            </label>
            <input
              type="text"
              value={deleteConfirmText}
              disabled={deleting}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              autoFocus
              className="mt-1.5 w-full rounded-[10px] border border-black/15 bg-white px-3 py-2 text-[14px] tracking-[-0.01em] text-[#1E1B4B] focus:border-red-500 focus:outline-none disabled:opacity-60"
            />

            <div className="mt-6 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteOpen(false)}
                disabled={deleting}
                className="rounded-pill border border-black/10 px-4 py-2 text-[13px] font-medium text-black/70 transition-colors hover:bg-black/[0.04] disabled:opacity-50"
              >
                {t("settings.account.delete.confirmCancel")}
              </button>
              <button
                type="button"
                onClick={handleDeleteAccount}
                disabled={
                  deleting ||
                  deleteConfirmText.trim().toLowerCase() !==
                    t("settings.account.delete.confirmInputKeyword").toLowerCase()
                }
                className="rounded-pill bg-red-600 px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-red-700 disabled:bg-red-300"
              >
                {deleting
                  ? t("settings.account.delete.deleting")
                  : t("settings.account.delete.confirmConfirm")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
