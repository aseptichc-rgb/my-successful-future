"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import {
  updateFutureSelf,
  updateUserGoals,
  updateQuotePreference,
  updateSuccessAffirmations,
  updateUserLanguage,
  markOnboarded,
} from "@/lib/firebase";
import { FUTURE_SELF_FIELD_MAX, hasAnyFutureSelfAnswer } from "@/lib/futureSelf";
import { computeOnboardingProgress } from "@/lib/onboardingProgress";
import { normalizeGoalText } from "@/lib/goalText";
import { needsMoreSpecificGoal } from "@/lib/goalQuality";
import { GOAL_TEXT_MAX, SUCCESS_AFFIRMATION_MAX_LEN } from "@/lib/constants/goal";
import { authedFetch } from "@/lib/authedFetch";
import { useLanguage, LOCALE_META, SUPPORTED_LOCALES, type Locale, type DictKey } from "@/lib/i18n";
import type { DailyMotivation, FutureSelfAnswers } from "@/types";

/* ─────────────────────────────────────────────────────────────────
 * Anima 온보딩 — "미래의 나 한 문장 + 선언 1줄 + 목표 딱 하나"
 * ─────────────────────────────────────────────────────────────────
 *  이전 온보딩은 11개 화면 / 최대 27개 입력칸(미래자아 7문항 + 다짐 10 + 목표 10)을
 *  요구했다. "입력이 너무 많고 복잡하다"는 피드백에 따라 화면 4개로 줄였다.
 *
 *  0 언어 · 1 꿈 1문항 · 2 성공 선언 + 오늘의 목표 · 3 미리보기
 *
 *  Step 1 은 예시 칩 없이 직접 쓰게 한다. 예시를 주면 사람들이 그걸 고르고 끝내는데,
 *  이 한 문장이 카드·비전·정체성·작가추천 4개 AI 소비처의 유일한 재료라 모두가 같은
 *  문장을 쓰면 모두의 생성물이 같은 곳으로 수렴한다. 대신 placeholder 가 무엇을 얼마나
 *  구체적으로 적어야 하는지 안내한다. (선택 입력이라 건너뛰기는 그대로 가능하다.)
 *
 *  Step 2 는 성격이 다른 두 문장을 한 화면에 위아래로 받는다:
 *    · 성공 선언(successAffirmations) — 이미 이룬 상태의 1인칭 문장. 매일 전사한다.
 *    · 오늘의 목표(goals)           — 그 사람이 되기 위해 오늘 옮기는 행동. 매일 체크한다.
 *  예전에는 목표에서 다짐을 자동 파생했지만, 두 문장이 같은 것을 가리켜 홈에 같은
 *  문장이 두 번 보였다. 이제 각각 받는다 — 다만 두 칸 모두
 *  **예시 칩으로 타이핑 0 완주**가 가능해 입력 부담은 늘지 않는다.
 *
 *  두 칸 모두 선택 입력이다. 건너뛰어도 온보딩은 완료되고, 나머지 6개 미래 차원과
 *  다짐 추가는 설정에서 원하는 사람만 채운다.
 * ────────────────────────────────────────────────────────────────── */

/** 0 = 언어, 1 = 미래 서술, 2 = 선언 + 목표, 3 = 미리보기. */
const TOTAL_STEPS = 4;
type Step = 0 | 1 | 2 | 3;

/** 성공 선언 예시 — 경제적 자유 · 건강 · 기여 세 축을 덮어 탭 한 번으로 채울 수 있게. */
const DECLARATION_EXAMPLE_KEYS: ReadonlyArray<DictKey> = [
  "onboarding.declaration.example1",
  "onboarding.declaration.example2",
  "onboarding.declaration.example3",
];

/** Step 3 초상 카드 표시용 — 서버 JSON 응답에서 쓰는 필드만 (Timestamp 직렬화 무관). */
interface PortraitPreview {
  title: string;
  portrait: string;
  highlights?: string[];
}

export default function OnboardingPage() {
  const router = useRouter();
  const { user, firebaseUser, loading: authLoading, refreshUser } = useAuth();
  const { t, locale, setLocale } = useLanguage();

  const [step, setStep] = useState<Step>(0);
  /** Step 1 — 진정 이루고 싶은 꿈. 예시 없이 직접 쓴다. */
  const [dreamAnswer, setDreamAnswer] = useState("");

  /** 성공 선언 1줄 — 목표에서 파생하지 않고 사용자가 직접 고른다/적는다. */
  const [declaration, setDeclaration] = useState("");
  /** 예시 칩 대신 직접 쓰겠다고 연 경우 (칩으로 채워진 선언은 자동 전개된다). */
  const [declarationCustomOpen, setDeclarationCustomOpen] = useState(false);

  const [goal, setGoal] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [previewLoading, setPreviewLoading] = useState(false);
  const [preview, setPreview] = useState<DailyMotivation | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const [portraitLoading, setPortraitLoading] = useState(false);
  const [portrait, setPortrait] = useState<PortraitPreview | null>(null);
  const [portraitError, setPortraitError] = useState<string | null>(null);

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

  /** 성공 선언 예시 선택 — 고르면 열려 있던 직접입력 편집을 접는다. */
  const handleSelectDeclaration = (example: string) => {
    setDeclaration(example.slice(0, SUCCESS_AFFIRMATION_MAX_LEN));
    setDeclarationCustomOpen(false);
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
   * Step 1·2 입력을 한 번에 저장하고 step 3 진입 시 첫 카드를 즉시 생성.
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

      // 꿈 1문항은 dream 차원에 담는다 — composeFuturePersona 가 "· 꿈: …" 로 붙여
      // 기존 futurePersona 필드에도 함께 기록하므로 AI 소비처(카드/비전/정체성/작가추천)는
      // 무수정 동작한다. daily 로 저장하면 Gemini 가 꿈 문장을 하루 묘사로 읽는다.
      const answers: FutureSelfAnswers = {};
      const dreamTrimmed = dreamAnswer.trim();
      if (dreamTrimmed.length > 0) answers.dream = dreamTrimmed;
      const hasFutureAnswers = hasAnyFutureSelfAnswer(answers);
      if (hasFutureAnswers) {
        await updateFutureSelf(uid, answers);
      }

      const cleanedGoal = normalizeGoalText(goal);
      if (cleanedGoal.length > 0) {
        await updateUserGoals(uid, [cleanedGoal]);
      }
      // 선언은 비어 있어도 저장(빈 배열로 정규화) — 두 칸 모두 건너뛴 사용자도 있다.
      const line = declaration.trim().slice(0, SUCCESS_AFFIRMATION_MAX_LEN);
      await updateSuccessAffirmations(uid, line.length > 0 ? [line] : []);

      // 인물 고정 없이 자동 회전을 기본값으로 저장 — 온보딩에서 더 묻지 않는다.
      // (설정에서 언제든 특정 인물을 고정할 수 있다.)
      await updateQuotePreference(uid, {
        pinnedAuthor: undefined,
        pinnedDaysPerWeek: 0,
      });
      await refreshUser().catch(() => {});

      // 핵심 입력이 모두 저장된 이 시점에 온보딩 완료 플래그를 박는다.
      // 미리보기에서 카드 생성 실패나 앱 종료로 finish 버튼을 못 눌러도
      // 다음 로그인 때 다시 온보딩으로 튕기지 않도록 보호.
      // refreshUser 재호출은 생략 — user.onboardedAt 이 즉시 truthy 가 되면
      // 상단 useEffect 가 /home 으로 튕겨 미리보기를 못 본다. 갱신은 finish() 가 한다.
      try {
        await markOnboarded(uid);
      } catch (err) {
        console.warn("[onboarding] markOnboarded 실패(무시하고 진행):", err);
      }

      // "10년 후 나의 모습" 초상 생성 — 데일리 카드와 병렬로 발사하고 결과를 기다리지 않는다.
      // (답변이 없으면 그릴 재료가 없으므로 호출 자체를 생략 — 미리보기에 섹션 미노출.)
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
          body: JSON.stringify({ force: true }),
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
      setStep(3);
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

  const declarationExamples = DECLARATION_EXAMPLE_KEYS.map((key) => t(key));
  // 미래 서술과 같은 규칙 — 예시에 없는 문장을 갖고 되돌아오면 입력칸을 자동 전개.
  const showDeclarationInput =
    declarationCustomOpen ||
    (declaration.length > 0 && !declarationExamples.includes(declaration));

  // 통합 진행바 — 언어 선택/미리보기에서는 null(미표시).
  const progress = computeOnboardingProgress(step);
  const goalHintVisible = needsMoreSpecificGoal(goal);

  return (
    <div className="flex min-h-screen flex-col bg-[#F0EDE6]">
      <div className="sticky top-0 z-10 border-b border-black/[0.06] bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center gap-4 px-5 py-3 sm:px-6">
          {progress ? (
            <div className="flex flex-1 items-center gap-3">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-black/10">
                <div
                  className="h-full rounded-full bg-[#1E1B4B] transition-[width] duration-300"
                  style={{ width: `${(progress.current / progress.total) * 100}%` }}
                />
              </div>
              <span className="shrink-0 text-[12px] font-medium tracking-[-0.01em] text-black/60">
                {progress.current} / {progress.total}
                {" · "}
                {progress.remaining > 0
                  ? t("onboarding.progress.remaining", { remaining: progress.remaining })
                  : t("onboarding.progress.lastStep")}
              </span>
            </div>
          ) : (
            <div className="flex-1" />
          )}
          {step > 0 && step < 3 && (
            <button
              type="button"
              onClick={handleSkip}
              disabled={saving}
              className="shrink-0 text-[13px] font-medium tracking-[-0.01em] text-black/48 hover:text-black/70 disabled:opacity-50"
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
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#1E1B4B]/60">
                {t("onboarding.futureSelf.sectionLabel")}
              </p>

              <h1 className="mt-4 text-[26px] font-semibold leading-[1.2] tracking-[-0.003em] text-[#1E1B4B] sm:text-[30px]">
                {t("onboarding.futureSelf.dream.q")}
              </h1>
              <p className="mt-2 text-[14px] leading-[1.5] tracking-[-0.022em] text-black/55">
                {t("onboarding.futureSelf.dream.hint")}
              </p>

              {/* 예시 칩 없이 직접 쓴다 — placeholder 가 구체성의 기준을 안내한다. */}
              <div className="mt-6">
                <textarea
                  value={dreamAnswer}
                  onChange={(e) =>
                    setDreamAnswer(e.target.value.slice(0, FUTURE_SELF_FIELD_MAX))
                  }
                  rows={6}
                  maxLength={FUTURE_SELF_FIELD_MAX}
                  placeholder={t("onboarding.futureSelf.dream.placeholder")}
                  className="w-full resize-none rounded-[14px] border border-black/10 bg-white px-4 py-3 text-[15px] leading-[1.6] tracking-[-0.01em] text-[#1E1B4B] placeholder:text-black/40 focus:border-[#1E1B4B] focus:outline-none"
                />
                {/* 카운터는 자기 줄에 둔다 — 안내 문장과 한 줄에 두면 문장 중간을 파고든다. */}
                <div className="mt-2 text-right text-[11px] tracking-[-0.01em] text-black/40">
                  {dreamAnswer.length}/{FUTURE_SELF_FIELD_MAX}
                </div>
                <p className="mt-1 text-[12px] leading-[1.5] tracking-[-0.01em] text-black/48">
                  {t("onboarding.futureSelf.dream.why")}
                </p>
              </div>
            </div>
          )}

          {step === 2 && (
            <div>
              {/* ── 위: 성공한 미래의 나 — 이미 이룬 상태의 1인칭 선언 ── */}
              <h1 className="text-[26px] font-semibold leading-[1.2] tracking-[-0.003em] text-[#1E1B4B] sm:text-[30px]">
                {t("onboarding.declaration.title")}
              </h1>
              <p className="mt-2 text-[14px] leading-[1.5] tracking-[-0.022em] text-black/55">
                {t("onboarding.declaration.subtitle")}
              </p>

              {/* 예시 칩 — Step 1 과 같은 규칙/마크업. 탭 한 번으로 채워 타이핑 0 완주. */}
              <div className="mt-6 space-y-2.5">
                {DECLARATION_EXAMPLE_KEYS.map((key, i) => {
                  const ex = declarationExamples[i];
                  const selected = declaration === ex;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => handleSelectDeclaration(ex)}
                      aria-pressed={selected}
                      className={`flex w-full items-start gap-3 rounded-[14px] border px-4 py-3 text-left transition-all ${
                        selected
                          ? "border-[#1E1B4B] bg-[#1E1B4B]/[0.04]"
                          : "border-black/10 bg-white hover:border-[#1E1B4B]/40"
                      }`}
                    >
                      <span
                        aria-hidden
                        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors ${
                          selected
                            ? "border-[#1E1B4B] bg-[#1E1B4B] text-white"
                            : "border-black/20 text-transparent"
                        }`}
                      >
                        <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                          <path d="M20 6L9 17l-5-5" />
                        </svg>
                      </span>
                      <span className="text-[15px] font-medium leading-[1.5] tracking-[-0.01em] text-[#1E1B4B]">
                        {ex}
                      </span>
                    </button>
                  );
                })}
              </div>

              {showDeclarationInput ? (
                <div className="mt-3">
                  <input
                    value={declaration}
                    maxLength={SUCCESS_AFFIRMATION_MAX_LEN}
                    onChange={(e) =>
                      setDeclaration(e.target.value.slice(0, SUCCESS_AFFIRMATION_MAX_LEN))
                    }
                    placeholder={t("onboarding.declaration.placeholder")}
                    className="w-full rounded-[14px] border border-black/10 bg-white px-4 py-3.5 text-[17px] leading-[1.4] tracking-[-0.01em] text-[#1E1B4B] placeholder:text-black/35 focus:border-[#1E1B4B] focus:outline-none"
                  />
                  <div className="mt-2 text-right text-[11px] tracking-[-0.01em] text-black/40">
                    {declaration.length}/{SUCCESS_AFFIRMATION_MAX_LEN}
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setDeclarationCustomOpen(true)}
                  className="mt-3 rounded-pill border border-dashed border-black/15 bg-white px-4 py-2 text-[12px] font-medium tracking-[-0.01em] text-black/60 transition-colors hover:border-[#1E1B4B] hover:text-[#1E1B4B]"
                >
                  {t("onboarding.declaration.writeMyOwn")}
                </button>
              )}

              {/* 선언 → 목표 사이의 인과를 눈으로 보이게 하는 구분선 */}
              <div className="my-8 h-px bg-black/[0.08]" />

              {/* ── 아래: 오늘의 목표 — 그 사람이 되기 위해 오늘 옮기는 행동 ── */}
              <h2 className="text-[20px] font-semibold leading-[1.2] tracking-[-0.003em] text-[#1E1B4B] sm:text-[22px]">
                {t("onboarding.goal.title")}
              </h2>
              <p className="mt-2 text-[14px] leading-[1.5] tracking-[-0.022em] text-black/55">
                {t("onboarding.goal.subtitle")}
              </p>

              <div className="mt-5">
                <input
                  value={goal}
                  maxLength={GOAL_TEXT_MAX}
                  onChange={(e) => setGoal(e.target.value)}
                  placeholder={t("onboarding.goal.placeholder")}
                  className="w-full rounded-[14px] border border-black/10 bg-white px-4 py-3.5 text-[17px] leading-[1.4] tracking-[-0.01em] text-[#1E1B4B] placeholder:text-black/35 focus:border-[#1E1B4B] focus:outline-none"
                />
                <p className="mt-2 text-[12px] leading-[1.5] tracking-[-0.01em] text-black/48">
                  {goalHintVisible ? t("goal.specific.hint") : t("onboarding.goal.hint")}
                </p>
              </div>
            </div>
          )}

          {step === 3 && (
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
            disabled={step === 0 || saving || step === 3}
            className="rounded-pill px-4 py-2.5 text-[14px] font-medium tracking-[-0.01em] text-black/70 transition-colors hover:bg-black/[0.04] disabled:opacity-30"
          >
            {t("common.prev")}
          </button>
          {step < 2 && (
            <button
              type="button"
              onClick={goNext}
              disabled={saving}
              className="rounded-pill bg-[#1E1B4B] px-6 py-2.5 text-[14px] font-medium tracking-[-0.01em] text-white transition-colors hover:bg-[#2A2766] disabled:opacity-50"
            >
              {t("common.next")}
            </button>
          )}
          {step === 2 && (
            <button
              type="button"
              onClick={saveAndPreview}
              disabled={saving}
              className="rounded-pill bg-[#1E1B4B] px-6 py-2.5 text-[14px] font-medium tracking-[-0.01em] text-white transition-colors hover:bg-[#2A2766] disabled:opacity-50"
            >
              {saving ? t("onboarding.step4.preparing") : t("onboarding.step4.cta")}
            </button>
          )}
          {step === 3 && (
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
