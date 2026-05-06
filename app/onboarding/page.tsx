"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { updateFuturePersona, updateUserGoals, markOnboarded, MAX_USER_GOALS } from "@/lib/firebase";

const FUTURE_PERSONA_MAX = 500;
const GOAL_MAX = 80;

const FUTURE_PERSONA_EXAMPLES = [
  "5년 뒤 월 1,000만 원을 벌며 원하는 시간에 원하는 일을 하고 있다. 매일 아침 운동과 독서로 하루를 시작한다.",
  "10년 뒤 분야에서 손꼽히는 전문가가 되어, 강연과 집필로도 영향력을 넓히고 있다.",
  "7년 뒤 가족과 보내는 시간이 최우선인 삶을 살고 있다. 일은 하루 5시간만 하고, 주말은 무조건 비워둔다.",
];

export default function OnboardingPage() {
  const router = useRouter();
  const { user, firebaseUser, loading: authLoading, refreshUser } = useAuth();

  const [step, setStep] = useState<1 | 2>(1);
  const [futurePersona, setFuturePersona] = useState("");
  const [goals, setGoals] = useState<string[]>([""]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const goNext = () => setStep((s) => (s < 2 ? ((s + 1) as 1 | 2) : s));
  const goBack = () => setStep((s) => (s > 1 ? ((s - 1) as 1 | 2) : s));

  const finish = async () => {
    if (!firebaseUser) return;
    setSaving(true);
    setError(null);

    const withTimeout = async <T,>(p: Promise<T>, label: string, ms = 10000): Promise<T> => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        return await Promise.race<T>([
          p,
          new Promise<T>((_, reject) => {
            timer = setTimeout(() => reject(new Error(`${label} 타임아웃 (${ms}ms)`)), ms);
          }),
        ]);
      } finally {
        if (timer) clearTimeout(timer);
      }
    };

    try {
      const uid = firebaseUser.uid;
      if (futurePersona.trim()) {
        await withTimeout(updateFuturePersona(uid, futurePersona.trim()), "futurePersona");
      }
      const cleanedGoals = goals.map((g) => g.trim()).filter((g) => g.length > 0);
      if (cleanedGoals.length > 0) {
        await withTimeout(updateUserGoals(uid, cleanedGoals), "goals");
      }
      await withTimeout(markOnboarded(uid), "markOnboarded");
      await withTimeout(refreshUser(), "refreshUser", 5000).catch(() => {});
      router.replace("/home");
      setSaving(false);
    } catch (err) {
      console.error("[onboarding] 저장 실패:", err);
      const msg = err instanceof Error ? err.message : String(err);
      setError(`저장에 실패했어요. (${msg}) 잠시 후 다시 시도해 주세요.`);
      setSaving(false);
    }
  };

  const handleSkip = async () => {
    if (!firebaseUser) return;
    setSaving(true);
    try {
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

  return (
    <div className="flex min-h-screen flex-col bg-[#F0EDE6]">
      <div className="sticky top-0 z-10 border-b border-black/[0.06] bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-5 py-3 sm:px-6">
          <div className="flex items-center gap-1.5">
            {[1, 2].map((n) => (
              <span
                key={n}
                className={`h-1.5 w-8 rounded-full transition-colors ${
                  n <= step ? "bg-[#1E1B4B]" : "bg-black/10"
                }`}
              />
            ))}
            <span className="ml-3 text-[12px] font-medium tracking-[-0.01em] text-black/60">
              {step} / 2
            </span>
          </div>
          <button
            type="button"
            onClick={handleSkip}
            disabled={saving}
            className="text-[13px] font-medium tracking-[-0.01em] text-black/48 hover:text-black/70 disabled:opacity-50"
          >
            건너뛰기
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-8 sm:px-6 sm:py-12">
        <div className="mx-auto max-w-2xl">
          {step === 1 && (
            <div>
              <h1 className="text-[28px] font-semibold leading-[1.14] tracking-[-0.003em] text-[#1E1B4B] sm:text-[32px]">
                10년 후의 나의 모습은 어떤가요?
              </h1>
              <p className="mt-2 text-[15px] leading-[1.47] tracking-[-0.022em] text-black/60">
                되고 싶은 모습을 한 단락으로 적어보세요. 매일 도착하는 동기부여 한 마디가 이 글을 바탕으로 만들어져요.
              </p>

              <textarea
                value={futurePersona}
                onChange={(e) => setFuturePersona(e.target.value.slice(0, FUTURE_PERSONA_MAX))}
                rows={8}
                maxLength={FUTURE_PERSONA_MAX}
                placeholder="예: 10년 뒤 나는 매일 아침 운동과 독서로 하루를 시작하고, 가족과 충분한 시간을 보내며 좋아하는 일로 안정적인 수익을 만든다."
                className="mt-6 w-full resize-none rounded-[14px] border border-black/10 bg-white px-4 py-3 text-[14px] leading-[1.6] tracking-[-0.01em] text-[#1E1B4B] placeholder:text-black/40 focus:border-[#1E1B4B] focus:outline-none"
              />
              <div className="mt-2 text-right text-[11px] tracking-[-0.01em] text-black/40">
                {futurePersona.length}/{FUTURE_PERSONA_MAX}
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {FUTURE_PERSONA_EXAMPLES.map((ex, i) => (
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

              <p className="mt-4 text-[12px] leading-[1.5] tracking-[-0.01em] text-black/48">
                비워둬도 괜찮아요. 나중에 홈에서 언제든 다시 작성할 수 있어요.
              </p>
            </div>
          )}

          {step === 2 && (
            <div>
              <h1 className="text-[28px] font-semibold leading-[1.14] tracking-[-0.003em] text-[#1E1B4B] sm:text-[32px]">
                지금 향하고 있는 목표를 적어주세요
              </h1>
              <p className="mt-2 text-[15px] leading-[1.47] tracking-[-0.022em] text-black/60">
                앞 3개 목표가 매일 동기부여 카드와 잠금화면에 함께 표시돼요. 우선순위대로 적어주세요.
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
                      placeholder="예: 매일 30분 책 읽기"
                      className="min-w-0 flex-1 rounded-[10px] border border-black/10 bg-white px-3 py-2 text-[14px] tracking-[-0.01em] text-[#1E1B4B] placeholder:text-black/40 focus:border-[#1E1B4B] focus:outline-none"
                    />
                    {goals.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveGoalRow(idx)}
                        aria-label="목표 줄 제거"
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
                  + 목표 추가
                </button>
              )}

              <p className="mt-4 text-[12px] leading-[1.5] tracking-[-0.01em] text-black/48">
                나중에 홈에서 언제든 추가하거나 정리할 수 있어요. (최대 {MAX_USER_GOALS}개)
              </p>
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
            disabled={step === 1 || saving}
            className="rounded-pill px-4 py-2.5 text-[14px] font-medium tracking-[-0.01em] text-black/70 transition-colors hover:bg-black/[0.04] disabled:opacity-30"
          >
            이전
          </button>
          {step < 2 ? (
            <button
              type="button"
              onClick={goNext}
              disabled={saving}
              className="rounded-pill bg-[#1E1B4B] px-6 py-2.5 text-[14px] font-medium tracking-[-0.01em] text-white transition-colors hover:bg-[#2A2766] disabled:opacity-50"
            >
              다음
            </button>
          ) : (
            <button
              type="button"
              onClick={finish}
              disabled={saving}
              className="rounded-pill bg-[#1E1B4B] px-6 py-2.5 text-[14px] font-medium tracking-[-0.01em] text-white transition-colors hover:bg-[#2A2766] disabled:opacity-50"
            >
              {saving ? "저장 중…" : "시작하기 →"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
