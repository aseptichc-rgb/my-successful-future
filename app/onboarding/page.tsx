"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import {
  updateFuturePersona,
  updateUserGoals,
  updateQuotePreference,
  updateSuccessAffirmations,
  updateUserLanguage,
  markOnboarded,
  MAX_USER_GOALS,
} from "@/lib/firebase";
import { authedFetch } from "@/lib/authedFetch";
import AffirmationsEditor from "@/components/affirmations/AffirmationsEditor";
import { useLanguage, LOCALE_META, SUPPORTED_LOCALES, type Locale, type DictKey } from "@/lib/i18n";
import type { DailyMotivation } from "@/types";

const FUTURE_PERSONA_MAX = 500;
const GOAL_MAX = 80;
/** 0 = 언어 선택, 1~5 = 기존 단계. */
const TOTAL_STEPS = 6;
type Step = 0 | 1 | 2 | 3 | 4 | 5;

interface PinAuthorOption {
  /** 사전 키 — 표시용 라벨/태그/톤이 모두 i18n 으로 갈린다. */
  nameKey: DictKey;
  tagKey: DictKey;
  toneKey: DictKey;
}

const PIN_AUTHOR_OPTIONS: ReadonlyArray<PinAuthorOption> = [
  { nameKey: "onboarding.author.steveJobs", tagKey: "onboarding.author.steveJobs.tag", toneKey: "onboarding.author.steveJobs.tone" },
  { nameKey: "onboarding.author.einstein", tagKey: "onboarding.author.einstein.tag", toneKey: "onboarding.author.einstein.tone" },
  { nameKey: "onboarding.author.aurelius", tagKey: "onboarding.author.aurelius.tag", toneKey: "onboarding.author.aurelius.tone" },
  { nameKey: "onboarding.author.angelou", tagKey: "onboarding.author.angelou.tag", toneKey: "onboarding.author.angelou.tone" },
  { nameKey: "onboarding.author.buffett", tagKey: "onboarding.author.buffett.tag", toneKey: "onboarding.author.buffett.tone" },
  { nameKey: "onboarding.author.leeOryeong", tagKey: "onboarding.author.leeOryeong.tag", toneKey: "onboarding.author.leeOryeong.tone" },
];

const PIN_DAYS_DEFAULT = 4;

export default function OnboardingPage() {
  const router = useRouter();
  const { user, firebaseUser, loading: authLoading, refreshUser } = useAuth();
  const { t, locale, setLocale } = useLanguage();

  const [step, setStep] = useState<Step>(0);
  const [futurePersona, setFuturePersona] = useState("");
  const [goals, setGoals] = useState<string[]>([""]);
  const [affirmations, setAffirmations] = useState<string[]>([]);
  const [pinnedAuthor, setPinnedAuthor] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [previewLoading, setPreviewLoading] = useState(false);
  const [preview, setPreview] = useState<DailyMotivation | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!firebaseUser) {
      router.replace("/login");
      return;
    }
    if (user?.onboardedAt) {
      router.replace("/home");
    }
  }, [authLoading, firebaseUser, user?.onboardedAt, router]);

  const handleGoalChange = (idx: number, value: string) => {
    setGoals((prev) => prev.map((g, i) => (i === idx ? value.slice(0, GOAL_MAX) : g)));
  };
  const handleAddGoalRow = () => {
    setGoals((prev) => (prev.length >= MAX_USER_GOALS ? prev : [...prev, ""]));
  };
  const handleRemoveGoalRow = (idx: number) => {
    setGoals((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx)));
  };

  const goNext = () => setStep((s) => (s < (TOTAL_STEPS - 1) ? ((s + 1) as Step) : s));
  const goBack = () => setStep((s) => (s > 0 ? ((s - 1) as Step) : s));

  /**
   * Step 0 → 1 진입 시 선택한 언어를 즉시 Firestore 에 저장.
   * 다음 단계의 모든 UI 가 그 언어로 표시되며, 저장 실패는 logger 에만 남기고 진행.
   */
  const handleSelectLanguage = async (next: Locale) => {
    setLocale(next);
    if (firebaseUser) {
      try {
        await updateUserLanguage(firebaseUser.uid, next);
        await refreshUser().catch(() => {});
      } catch (err) {
        console.warn("[onboarding] 언어 저장 실패(무시하고 진행):", err);
      }
    }
  };

  /**
   * Step 1·2·3 입력을 한 번에 저장하고 step 4 진입 시 첫 카드를 즉시 생성.
   * 환불 윈도우 2시간 안에 "이 앱을 산 이유" 를 체감하게 하는 것이 핵심 — 카드가 보이기 전엔 끝내지 않는다.
   */
  const saveAndPreview = async () => {
    if (!firebaseUser) return;
    setSaving(true);
    setError(null);

    try {
      const uid = firebaseUser.uid;
      // 언어를 한 번 더 동기화 (step0 저장이 어떤 이유로 누락된 경우 보호)
      try { await updateUserLanguage(uid, locale); } catch {}

      if (futurePersona.trim()) {
        await updateFuturePersona(uid, futurePersona.trim());
      }
      const cleanedGoals = goals.map((g) => g.trim()).filter((g) => g.length > 0);
      if (cleanedGoals.length > 0) {
        await updateUserGoals(uid, cleanedGoals);
      }
      // 다짐은 비어 있어도 저장(빈 배열로 정규화) — 사용자가 의도적으로 안 적었을 수 있다.
      await updateSuccessAffirmations(uid, affirmations);
      await updateQuotePreference(uid, {
        pinnedAuthor: pinnedAuthor || undefined,
        pinnedDaysPerWeek: pinnedAuthor ? PIN_DAYS_DEFAULT : 0,
      });
      await refreshUser().catch(() => {});

      // 첫 카드 즉시 생성 (force=true 로 핀 인물 반영)
      setPreviewLoading(true);
      setPreviewError(null);
      try {
        const res = await authedFetch("/api/daily-motivation", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            force: true,
            ...(pinnedAuthor ? { overrideAuthor: pinnedAuthor } : {}),
          }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          motivation?: DailyMotivation;
          error?: string;
        };
        if (!res.ok || !data.motivation) {
          throw new Error(data.error || `${t("common.error")} (${res.status})`);
        }
        setPreview(data.motivation);
      } catch (err) {
        setPreviewError(err instanceof Error ? err.message : String(err));
      } finally {
        setPreviewLoading(false);
      }

      setSaving(false);
      setStep(5);
    } catch (err) {
      console.error("[onboarding] 저장 실패:", err);
      const msg = err instanceof Error ? err.message : String(err);
      setError(`${t("onboarding.saveError")} (${msg})`);
      setSaving(false);
    }
  };

  const finish = async () => {
    if (!firebaseUser) return;
    setSaving(true);
    try {
      await markOnboarded(firebaseUser.uid);
      await refreshUser().catch(() => {});
      router.replace("/home");
    } catch (err) {
      console.error("[onboarding] finish 실패:", err);
      setSaving(false);
    }
  };

  const handleSkip = async () => {
    if (!firebaseUser) return;
    setSaving(true);
    try {
      // 언어는 어쨌든 보존
      try { await updateUserLanguage(firebaseUser.uid, locale); } catch {}
      await markOnboarded(firebaseUser.uid);
      await refreshUser().catch(() => {});
      router.replace("/home");
    } catch (err) {
      console.error("[onboarding] skip 실패:", err);
      setSaving(false);
    }
  };

  if (authLoading || !firebaseUser) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F0EDE6]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-black/10 border-t-[#1E1B4B]" />
      </div>
    );
  }

  const futurePersonaExamples = [
    t("onboarding.step1.example1"),
    t("onboarding.step1.example2"),
    t("onboarding.step1.example3"),
  ];

  return (
    <div className="flex min-h-screen flex-col bg-[#F0EDE6]">
      <div className="sticky top-0 z-10 border-b border-black/[0.06] bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-5 py-3 sm:px-6">
          <div className="flex items-center gap-1.5">
            {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
              <span
                key={i}
                className={`h-1.5 w-8 rounded-full transition-colors ${
                  i <= step ? "bg-[#1E1B4B]" : "bg-black/10"
                }`}
              />
            ))}
            <span className="ml-3 text-[12px] font-medium tracking-[-0.01em] text-black/60">
              {step + 1} / {TOTAL_STEPS}
            </span>
          </div>
          {step > 0 && step < 5 && (
            <button
              type="button"
              onClick={handleSkip}
              disabled={saving}
              className="text-[13px] font-medium tracking-[-0.01em] text-black/48 hover:text-black/70 disabled:opacity-50"
            >
              {t("common.skip")}
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-8 sm:px-6 sm:py-12">
        <div className="mx-auto max-w-2xl">
          {step === 0 && (
            <div>
              <h1 className="text-[28px] font-semibold leading-[1.14] tracking-[-0.003em] text-[#1E1B4B] sm:text-[32px]">
                {t("language.title")}
              </h1>
              <p className="mt-2 text-[15px] leading-[1.47] tracking-[-0.022em] text-black/60">
                {t("language.subtitle")}
              </p>

              <div className="mt-6 grid gap-2 sm:grid-cols-2">
                {SUPPORTED_LOCALES.map((code) => {
                  const meta = LOCALE_META[code];
                  const selected = locale === code;
                  return (
                    <button
                      key={code}
                      type="button"
                      onClick={() => handleSelectLanguage(code)}
                      className={`flex items-center gap-3 rounded-[14px] border px-4 py-3 text-left transition-all ${
                        selected
                          ? "border-[#1E1B4B] bg-[#1E1B4B]/[0.04]"
                          : "border-black/10 bg-white hover:border-[#1E1B4B]/40"
                      }`}
                    >
                      <span className="text-[24px] leading-none" aria-hidden>{meta.flag}</span>
                      <span>
                        <p className="text-[15px] font-semibold tracking-[-0.015em] text-[#1E1B4B]">
                          {meta.nativeLabel}
                        </p>
                        <p className="mt-0.5 text-[12px] tracking-[-0.005em] text-black/55">
                          {meta.englishLabel}
                        </p>
                      </span>
                    </button>
                  );
                })}
              </div>

              <p className="mt-4 text-[12px] leading-[1.5] tracking-[-0.01em] text-black/48">
                {t("language.changeNote")}
              </p>
            </div>
          )}

          {step === 1 && (
            <div>
              <h1 className="text-[28px] font-semibold leading-[1.14] tracking-[-0.003em] text-[#1E1B4B] sm:text-[32px]">
                {t("onboarding.step1.title")}
              </h1>
              <p className="mt-2 text-[15px] leading-[1.47] tracking-[-0.022em] text-black/60">
                {t("onboarding.step1.subtitle")}
              </p>

              <textarea
                value={futurePersona}
                onChange={(e) => setFuturePersona(e.target.value.slice(0, FUTURE_PERSONA_MAX))}
                rows={8}
                maxLength={FUTURE_PERSONA_MAX}
                placeholder={t("onboarding.step1.placeholder")}
                className="mt-6 w-full resize-none rounded-[14px] border border-black/10 bg-white px-4 py-3 text-[14px] leading-[1.6] tracking-[-0.01em] text-[#1E1B4B] placeholder:text-black/40 focus:border-[#1E1B4B] focus:outline-none"
              />
              <div className="mt-2 text-right text-[11px] tracking-[-0.01em] text-black/40">
                {futurePersona.length}/{FUTURE_PERSONA_MAX}
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {futurePersonaExamples.map((ex, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setFuturePersona(ex)}
                    className="rounded-pill border border-black/10 bg-white px-3 py-1.5 text-[12px] tracking-[-0.01em] text-black/70 transition-colors hover:border-[#1E1B4B] hover:text-[#1E1B4B]"
                  >
                    {ex.length > 32 ? ex.slice(0, 32) + "…" : ex}
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 2 && (
            <div>
              <h1 className="text-[28px] font-semibold leading-[1.14] tracking-[-0.003em] text-[#1E1B4B] sm:text-[32px]">
                {t("onboarding.step2.title")}
              </h1>
              <p className="mt-2 text-[15px] leading-[1.47] tracking-[-0.022em] text-black/60">
                {t("onboarding.step2.subtitle")}
              </p>

              <ul className="mt-6 space-y-2">
                {goals.map((goal, idx) => (
                  <li key={idx} className="flex items-center gap-2">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#1E1B4B]/10 text-[12px] font-semibold text-[#1E1B4B]">
                      {idx + 1}
                    </span>
                    <input
                      value={goal}
                      maxLength={GOAL_MAX}
                      onChange={(e) => handleGoalChange(idx, e.target.value)}
                      placeholder={t("onboarding.step2.placeholder")}
                      className="min-w-0 flex-1 rounded-[10px] border border-black/10 bg-white px-3 py-2 text-[14px] tracking-[-0.01em] text-[#1E1B4B] placeholder:text-black/40 focus:border-[#1E1B4B] focus:outline-none"
                    />
                    {goals.length > 1 && (
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
                    )}
                  </li>
                ))}
              </ul>

              {goals.length < MAX_USER_GOALS && (
                <button
                  type="button"
                  onClick={handleAddGoalRow}
                  className="mt-3 rounded-pill border border-dashed border-black/15 bg-white px-4 py-2 text-[12px] font-medium tracking-[-0.01em] text-black/60 transition-colors hover:border-[#1E1B4B] hover:text-[#1E1B4B]"
                >
                  {t("onboarding.step2.addGoal")}
                </button>
              )}
            </div>
          )}

          {step === 3 && (
            <div>
              <h1 className="text-[28px] font-semibold leading-[1.14] tracking-[-0.003em] text-[#1E1B4B] sm:text-[32px]">
                {t("onboarding.step3.title")}
              </h1>
              <p className="mt-2 text-[15px] leading-[1.47] tracking-[-0.022em] text-black/60">
                {t("onboarding.step3.subtitle")}
              </p>

              <div className="mt-6">
                <AffirmationsEditor
                  value={affirmations}
                  onChange={setAffirmations}
                />
              </div>
            </div>
          )}

          {step === 4 && (
            <div>
              <h1 className="text-[28px] font-semibold leading-[1.14] tracking-[-0.003em] text-[#1E1B4B] sm:text-[32px]">
                {t("onboarding.step4.title")}
              </h1>
              <p className="mt-2 text-[15px] leading-[1.47] tracking-[-0.022em] text-black/60">
                {t("onboarding.step4.subtitle")}
              </p>

              <div className="mt-6 grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setPinnedAuthor("")}
                  className={`rounded-[14px] border px-4 py-3 text-left transition-all ${
                    pinnedAuthor === ""
                      ? "border-[#1E1B4B] bg-[#1E1B4B]/[0.04]"
                      : "border-black/10 bg-white hover:border-[#1E1B4B]/40"
                  }`}
                >
                  <p className="text-[14px] font-semibold tracking-[-0.015em] text-[#1E1B4B]">
                    {t("onboarding.step4.autoTitle")}
                  </p>
                  <p className="mt-0.5 text-[12px] tracking-[-0.005em] text-black/55">
                    {t("onboarding.step4.autoSubtitle")}
                  </p>
                </button>
                {PIN_AUTHOR_OPTIONS.map((opt) => {
                  const name = t(opt.nameKey);
                  const isSelected = pinnedAuthor === name;
                  return (
                    <button
                      key={opt.nameKey}
                      type="button"
                      onClick={() => setPinnedAuthor(name)}
                      className={`rounded-[14px] border px-4 py-3 text-left transition-all ${
                        isSelected
                          ? "border-[#1E1B4B] bg-[#1E1B4B]/[0.04]"
                          : "border-black/10 bg-white hover:border-[#1E1B4B]/40"
                      }`}
                    >
                      <p className="text-[14px] font-semibold tracking-[-0.015em] text-[#1E1B4B]">
                        {name}
                      </p>
                      <p className="mt-0.5 text-[11px] font-medium uppercase tracking-[0.08em] text-[#1E1B4B]/60">
                        {t(opt.tagKey)}
                      </p>
                      <p className="mt-1 text-[12px] tracking-[-0.005em] text-black/55">
                        {t(opt.toneKey)}
                      </p>
                    </button>
                  );
                })}
              </div>

              <p className="mt-4 text-[12px] leading-[1.5] tracking-[-0.01em] text-black/48">
                {t("onboarding.step4.changeLater")}
              </p>
            </div>
          )}

          {step === 5 && (
            <div>
              <h1 className="text-[28px] font-semibold leading-[1.14] tracking-[-0.003em] text-[#1E1B4B] sm:text-[32px]">
                {previewLoading ? t("onboarding.step5.titleLoading") : t("onboarding.step5.titleDone")}
              </h1>
              <p className="mt-2 text-[15px] leading-[1.47] tracking-[-0.022em] text-black/60">
                {previewLoading ? t("onboarding.step5.subtitleLoading") : t("onboarding.step5.subtitleDone")}
              </p>

              {previewLoading && (
                <div className="mt-8 flex items-center justify-center rounded-[24px] bg-white/60 px-6 py-16">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-black/10 border-t-[#1E1B4B]" />
                </div>
              )}

              {!previewLoading && preview && (
                <div
                  className="mt-8 overflow-hidden rounded-[24px] p-7 shadow-[0_24px_60px_-24px_rgba(30,27,75,0.4)]"
                  style={{
                    background: `linear-gradient(${preview.gradient.angle}deg, ${preview.gradient.from} 0%, ${preview.gradient.to} 100%)`,
                  }}
                >
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-black/50">
                    {t("onboarding.step5.todayLabel")}
                  </p>
                  <p className={`mt-5 whitespace-pre-wrap text-[22px] font-bold leading-[1.4] tracking-[-0.02em] ${
                    preview.gradient.tone === "dark" ? "text-white" : "text-[#1E1B4B]"
                  }`}>
                    {preview.quote}
                  </p>
                  <p className={`mt-4 text-[13px] font-medium tracking-[-0.005em] ${
                    preview.gradient.tone === "dark" ? "text-white/72" : "text-black/56"
                  }`}>
                    — {preview.author}
                    {preview.source ? ` · ${preview.source}` : ""}
                  </p>

                  {preview.mission && (
                    <div
                      className={`mt-5 rounded-[14px] px-4 py-3 ${
                        preview.gradient.tone === "dark" ? "bg-white/12" : "bg-black/[0.06]"
                      }`}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <p
                          className={`text-[10px] font-semibold uppercase tracking-[0.12em] ${
                            preview.gradient.tone === "dark" ? "text-white/65" : "text-black/55"
                          }`}
                        >
                          {t("onboarding.step5.missionLabel")}
                        </p>
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            preview.gradient.tone === "dark"
                              ? "bg-white/15 text-white/85"
                              : "bg-[#1E1B4B]/10 text-[#1E1B4B]/80"
                          }`}
                        >
                          {t("onboarding.step5.missionIdentityPrefix")} {preview.mission.identityTag}
                        </span>
                      </div>
                      <p
                        className={`mt-2 text-[14px] font-semibold leading-[1.45] tracking-[-0.015em] ${
                          preview.gradient.tone === "dark" ? "text-white" : "text-[#1E1B4B]"
                        }`}
                      >
                        {preview.mission.prompt}
                      </p>
                      <p
                        className={`mt-2 text-[11px] tracking-[-0.005em] ${
                          preview.gradient.tone === "dark" ? "text-white/65" : "text-black/55"
                        }`}
                      >
                        {t("onboarding.step5.missionFooter")}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {!previewLoading && previewError && (
                <p className="mt-6 text-center text-[13px] tracking-[-0.01em] text-[#D85A30]">
                  {t("onboarding.step5.previewError")} ({previewError})
                </p>
              )}

              <div className="mt-8 rounded-[14px] border border-black/[0.06] bg-white p-4">
                <p className="text-[13px] font-semibold tracking-[-0.01em] text-[#1E1B4B]">
                  {t("onboarding.step5.widgetTitle")}
                </p>
                <ol className="mt-2 space-y-1 text-[12px] leading-[1.6] tracking-[-0.005em] text-black/60">
                  <li>{t("onboarding.step5.widgetStep1")}</li>
                  <li>{t("onboarding.step5.widgetStep2")}</li>
                  <li>{t("onboarding.step5.widgetStep3")}</li>
                </ol>
              </div>
            </div>
          )}

          {error && (
            <p className="mt-5 text-center text-[13px] tracking-[-0.01em] text-[#D85A30]">
              {error}
            </p>
          )}
        </div>
      </div>

      <div className="sticky bottom-0 border-t border-black/[0.06] bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-5 py-4 sm:px-6">
          <button
            type="button"
            onClick={goBack}
            disabled={step === 0 || saving || step === 5}
            className="rounded-pill px-4 py-2.5 text-[14px] font-medium tracking-[-0.01em] text-black/70 transition-colors hover:bg-black/[0.04] disabled:opacity-30"
          >
            {t("common.prev")}
          </button>
          {step < 4 && (
            <button
              type="button"
              onClick={goNext}
              disabled={saving}
              className="rounded-pill bg-[#1E1B4B] px-6 py-2.5 text-[14px] font-medium tracking-[-0.01em] text-white transition-colors hover:bg-[#2A2766] disabled:opacity-50"
            >
              {t("common.next")}
            </button>
          )}
          {step === 4 && (
            <button
              type="button"
              onClick={saveAndPreview}
              disabled={saving}
              className="rounded-pill bg-[#1E1B4B] px-6 py-2.5 text-[14px] font-medium tracking-[-0.01em] text-white transition-colors hover:bg-[#2A2766] disabled:opacity-50"
            >
              {saving ? t("onboarding.step4.preparing") : t("onboarding.step4.cta")}
            </button>
          )}
          {step === 5 && (
            <button
              type="button"
              onClick={finish}
              disabled={saving}
              className="rounded-pill bg-[#1E1B4B] px-6 py-2.5 text-[14px] font-medium tracking-[-0.01em] text-white transition-colors hover:bg-[#2A2766] disabled:opacity-50"
            >
              {saving ? t("onboarding.step5.finishing") : t("onboarding.step5.start")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
