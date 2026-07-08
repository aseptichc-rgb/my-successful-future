"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import {
  updateFutureSelf,
  updateUserGoals,
  updateQuotePreference,
  updateSuccessAffirmations,
  updateUserLanguage,
  markOnboarded,
  MAX_USER_GOALS,
} from "@/lib/firebase";
import {
  FUTURE_SELF_DIMENSIONS,
  FUTURE_SELF_FIELD_MAX,
  hasAnyFutureSelfAnswer,
  type FutureSelfDimension,
} from "@/lib/futureSelf";
import { authedFetch } from "@/lib/authedFetch";
import AffirmationsEditor from "@/components/affirmations/AffirmationsEditor";
import { useLanguage, LOCALE_META, SUPPORTED_LOCALES, type Locale, type DictKey } from "@/lib/i18n";
import {
  getKnownAuthorsForLanguage,
  getAuthorCategoryMap,
} from "@/lib/famousQuoteCatalog";
import type {
  DailyMotivation,
  FamousQuoteCategory,
  FutureSelfAnswers,
  UserLanguage,
} from "@/types";

const GOAL_MAX = 80;
/** 0 = 언어 선택, 1~5 = 기존 단계. */
const TOTAL_STEPS = 6;
type Step = 0 | 1 | 2 | 3 | 4 | 5;

/** Step 1 몰입형 질문 화면 수 = 차원 수(7). */
const FUTURE_QUESTION_COUNT = FUTURE_SELF_DIMENSIONS.length;

/** 차원 → i18n 질문/placeholder 키. 동적 키 조합 대신 명시 매핑으로 타입 안전 확보. */
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
/** 모든 차원에 구체 예시칩 3개씩 제공 — 빈 화면 앞에서 막히지 않고 톤을 잡을 수 있게. */
const FUTURE_EXAMPLE_KEYS: Record<FutureSelfDimension, ReadonlyArray<DictKey>> = {
  daily: [
    "onboarding.futureSelf.daily.example1",
    "onboarding.futureSelf.daily.example2",
    "onboarding.futureSelf.daily.example3",
  ],
  work: [
    "onboarding.futureSelf.work.example1",
    "onboarding.futureSelf.work.example2",
    "onboarding.futureSelf.work.example3",
  ],
  wealth: [
    "onboarding.futureSelf.wealth.example1",
    "onboarding.futureSelf.wealth.example2",
    "onboarding.futureSelf.wealth.example3",
  ],
  family: [
    "onboarding.futureSelf.family.example1",
    "onboarding.futureSelf.family.example2",
    "onboarding.futureSelf.family.example3",
  ],
  achievements: [
    "onboarding.futureSelf.achievements.example1",
    "onboarding.futureSelf.achievements.example2",
    "onboarding.futureSelf.achievements.example3",
  ],
  respect: [
    "onboarding.futureSelf.respect.example1",
    "onboarding.futureSelf.respect.example2",
    "onboarding.futureSelf.respect.example3",
  ],
  growth: [
    "onboarding.futureSelf.growth.example1",
    "onboarding.futureSelf.growth.example2",
    "onboarding.futureSelf.growth.example3",
  ],
};

/** Step 5 초상 카드 표시용 — 서버 JSON 응답에서 쓰는 필드만 (Timestamp 직렬화 무관). */
interface PortraitPreview {
  title: string;
  portrait: string;
  highlights?: string[];
}

const CATEGORY_LABEL_KEY: Record<FamousQuoteCategory, DictKey> = {
  philosophy: "onboarding.category.philosophy",
  entrepreneur: "onboarding.category.entrepreneur",
  classic: "onboarding.category.classic",
  leader: "onboarding.category.leader",
  scientist: "onboarding.category.scientist",
  literature: "onboarding.category.literature",
  // personal 은 핀 후보에서 이미 제외되므로 노출되지 않지만 타입 안전을 위해 매핑.
  personal: "onboarding.category.philosophy",
};

const PIN_DAYS_DEFAULT = 4;

export default function OnboardingPage() {
  const router = useRouter();
  const { user, firebaseUser, loading: authLoading, refreshUser } = useAuth();
  const { t, locale, setLocale } = useLanguage();

  const [step, setStep] = useState<Step>(0);
  /** 몰입형 "10년 후 나의 모습" — 한 화면에 한 질문. 0..FUTURE_QUESTION_COUNT-1. */
  const [futureStep, setFutureStep] = useState(0);
  const [futureAnswers, setFutureAnswers] = useState<FutureSelfAnswers>({});
  const [goals, setGoals] = useState<string[]>([""]);
  const [affirmations, setAffirmations] = useState<string[]>([]);
  const [pinnedAuthor, setPinnedAuthor] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [previewLoading, setPreviewLoading] = useState(false);
  const [preview, setPreview] = useState<DailyMotivation | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const [portraitLoading, setPortraitLoading] = useState(false);
  const [portrait, setPortrait] = useState<PortraitPreview | null>(null);
  const [portraitError, setPortraitError] = useState<string | null>(null);

  /**
   * 현재 언어 풀의 모든 인물을 노출. 시드가 늘면 자동으로 따라온다.
   * Locale 과 UserLanguage 는 동일한 4개 코드라 그대로 넘긴다.
   */
  const pinAuthors = useMemo(() => {
    const lang: UserLanguage = locale;
    const names = getKnownAuthorsForLanguage(lang);
    const catMap = getAuthorCategoryMap(lang);
    return names.map((name) => ({
      name,
      category: catMap.get(name) ?? ("philosophy" as FamousQuoteCategory),
    }));
  }, [locale]);

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

  const handleFutureAnswerChange = (dim: FutureSelfDimension, value: string) => {
    setFutureAnswers((prev) => ({ ...prev, [dim]: value.slice(0, FUTURE_SELF_FIELD_MAX) }));
  };

  /**
   * 다음/이전 버튼이 Step 1 안에서는 몰입형 질문(futureStep)을 먼저 구동한다.
   * 마지막 질문에서 "다음" → step 2, 첫 질문에서 "이전" → step 0 (언어 선택).
   */
  const goNext = () => {
    if (step === 1 && futureStep < FUTURE_QUESTION_COUNT - 1) {
      setFutureStep((fs) => fs + 1);
      return;
    }
    setStep((s) => (s < (TOTAL_STEPS - 1) ? ((s + 1) as Step) : s));
  };
  const goBack = () => {
    if (step === 1 && futureStep > 0) {
      setFutureStep((fs) => fs - 1);
      return;
    }
    setStep((s) => (s > 0 ? ((s - 1) as Step) : s));
  };

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

      const hasFutureAnswers = hasAnyFutureSelfAnswer(futureAnswers);
      if (hasFutureAnswers) {
        // 구조화 답변 + 합성 futurePersona 를 함께 저장 (기존 AI 소비처 호환).
        await updateFutureSelf(uid, futureAnswers);
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

      // 핵심 입력이 모두 저장된 이 시점에 온보딩 완료 플래그를 박는다.
      // Step 5 미리보기에서 카드 생성 실패나 앱 종료로 finish 버튼을 못 눌러도
      // 다음 로그인 때 다시 온보딩으로 튕기지 않도록 보호.
      // refreshUser 재호출은 생략 — user.onboardedAt 이 즉시 truthy 가 되면
      // 상단 useEffect 가 /home 으로 튕겨 미리보기를 못 본다. 갱신은 finish() 가 한다.
      try {
        await markOnboarded(uid);
      } catch (err) {
        console.warn("[onboarding] markOnboarded 실패(무시하고 진행):", err);
      }

      // "10년 후 나의 모습" 초상 생성 — 데일리 카드와 병렬로 발사하고 결과를 기다리지 않는다.
      // (답변이 하나도 없으면 그릴 재료가 없으므로 호출 자체를 생략 — Step 5 에 섹션 미노출.)
      if (hasFutureAnswers) {
        setPortraitLoading(true);
        setPortraitError(null);
        void (async () => {
          try {
            const res = await authedFetch("/api/future-self/portrait", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({}),
            });
            const data = (await res.json().catch(() => ({}))) as {
              portrait?: PortraitPreview;
              error?: string;
            };
            if (!res.ok || !data.portrait) {
              throw new Error(data.error || `${t("common.error")} (${res.status})`);
            }
            setPortrait(data.portrait);
          } catch (err) {
            console.warn("[onboarding] 초상 생성 실패:", err);
            setPortraitError(t("onboarding.step5.portraitError"));
          } finally {
            setPortraitLoading(false);
          }
        })();
      }

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

  const currentDimension = FUTURE_SELF_DIMENSIONS[futureStep];
  const currentExampleKeys = FUTURE_EXAMPLE_KEYS[currentDimension];

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
            <div key={currentDimension}>
              {/* 몰입형: 한 화면에 한 질문. 섹션 라벨 + 서브 진행으로 흐름을 잡아준다. */}
              <div className="flex items-center gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#1E1B4B]/60">
                  {t("onboarding.futureSelf.sectionLabel")}
                </p>
                <span className="text-[11px] font-medium tracking-[-0.01em] text-black/40">
                  {t("onboarding.futureSelf.progress", {
                    current: futureStep + 1,
                    total: FUTURE_QUESTION_COUNT,
                  })}
                </span>
              </div>
              <div className="mt-2 flex items-center gap-1">
                {FUTURE_SELF_DIMENSIONS.map((dim, i) => (
                  <span
                    key={dim}
                    className={`h-1 flex-1 rounded-full transition-colors ${
                      i <= futureStep ? "bg-[#1E1B4B]/70" : "bg-black/10"
                    }`}
                  />
                ))}
              </div>

              <h1 className="mt-6 text-[26px] font-semibold leading-[1.2] tracking-[-0.003em] text-[#1E1B4B] sm:text-[30px]">
                {t(FUTURE_Q_KEY[currentDimension])}
              </h1>
              <p className="mt-2 text-[14px] leading-[1.5] tracking-[-0.022em] text-black/55">
                {t("onboarding.futureSelf.hint")}
              </p>

              <textarea
                value={futureAnswers[currentDimension] ?? ""}
                onChange={(e) => handleFutureAnswerChange(currentDimension, e.target.value)}
                rows={6}
                maxLength={FUTURE_SELF_FIELD_MAX}
                placeholder={t(FUTURE_PH_KEY[currentDimension])}
                className="mt-6 w-full resize-none rounded-[14px] border border-black/10 bg-white px-4 py-3 text-[15px] leading-[1.6] tracking-[-0.01em] text-[#1E1B4B] placeholder:text-black/40 focus:border-[#1E1B4B] focus:outline-none"
              />
              <div className="mt-2 text-right text-[11px] tracking-[-0.01em] text-black/40">
                {(futureAnswers[currentDimension] ?? "").length}/{FUTURE_SELF_FIELD_MAX}
              </div>

              {currentExampleKeys.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {currentExampleKeys.map((key) => {
                    const ex = t(key);
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => handleFutureAnswerChange(currentDimension, ex)}
                        className="rounded-pill border border-black/10 bg-white px-3 py-1.5 text-[12px] tracking-[-0.01em] text-black/70 transition-colors hover:border-[#1E1B4B] hover:text-[#1E1B4B]"
                      >
                        {ex.length > 32 ? ex.slice(0, 32) + "…" : ex}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* 표시 순서: 다짐(step===2) → 행동(이 블록 step===3). i18n 키 이름의 숫자는
              콘텐츠 식별자일 뿐 표시 순서와 무관 — 다짐을 먼저 적고 그 다음 행동을 적게 한다. */}
          {step === 3 && (
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

          {step === 2 && (
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
                {pinAuthors.map(({ name, category }) => {
                  const isSelected = pinnedAuthor === name;
                  return (
                    <button
                      key={name}
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
                        {t(CATEGORY_LABEL_KEY[category])}
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
                  {preview.originalText && (
                    <p
                      className={`mt-3 whitespace-pre-wrap text-[13px] italic leading-[1.5] tracking-[-0.01em] ${
                        preview.gradient.tone === "dark" ? "text-white/72" : "text-black/56"
                      }`}
                      lang={preview.originalLang}
                    >
                      {preview.originalText}
                    </p>
                  )}
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

              {/* "10년 후 나의 모습" 초상 — 답변이 있을 때만 생성/노출. 데일리 카드와 병렬 생성. */}
              {(portraitLoading || portrait || portraitError) && (
                <div className="mt-6 rounded-[24px] bg-[#1E1B4B] p-7 shadow-[0_24px_60px_-24px_rgba(30,27,75,0.5)]">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/50">
                    {t("onboarding.step5.portraitLabel")}
                  </p>
                  {portraitLoading && (
                    <div className="mt-6 flex items-center gap-3">
                      <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-white" />
                      <p className="text-[13px] tracking-[-0.01em] text-white/70">
                        {t("onboarding.step5.portraitLoading")}
                      </p>
                    </div>
                  )}
                  {!portraitLoading && portrait && (
                    <>
                      <p className="mt-4 text-[20px] font-bold leading-[1.35] tracking-[-0.02em] text-white">
                        {portrait.title}
                      </p>
                      <p className="mt-3 whitespace-pre-wrap text-[14px] leading-[1.7] tracking-[-0.01em] text-white/85">
                        {portrait.portrait}
                      </p>
                      {portrait.highlights && portrait.highlights.length > 0 && (
                        <ul className="mt-4 space-y-1.5">
                          {portrait.highlights.map((h, i) => (
                            <li
                              key={i}
                              className="flex items-start gap-2 text-[12px] leading-[1.5] tracking-[-0.005em] text-white/70"
                            >
                              <span aria-hidden className="mt-[1px] text-white/45">·</span>
                              {h}
                            </li>
                          ))}
                        </ul>
                      )}
                    </>
                  )}
                  {!portraitLoading && !portrait && portraitError && (
                    <p className="mt-4 text-[13px] leading-[1.5] tracking-[-0.01em] text-white/70">
                      {portraitError}
                    </p>
                  )}
                </div>
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
