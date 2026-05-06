"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import {
  updateFuturePersona,
  updateUserGoals,
  updateQuotePreference,
  markOnboarded,
  MAX_USER_GOALS,
} from "@/lib/firebase";
import { authedFetch } from "@/lib/authedFetch";
import type { DailyMotivation } from "@/types";

const FUTURE_PERSONA_MAX = 500;
const GOAL_MAX = 80;
const TOTAL_STEPS = 4;

const FUTURE_PERSONA_EXAMPLES = [
  "5년 뒤 월 1,000만 원을 벌며 원하는 시간에 원하는 일을 하고 있다. 매일 아침 운동과 독서로 하루를 시작한다.",
  "10년 뒤 분야에서 손꼽히는 전문가가 되어, 강연과 집필로도 영향력을 넓히고 있다.",
  "7년 뒤 가족과 보내는 시간이 최우선인 삶을 살고 있다. 일은 하루 5시간만 하고, 주말은 무조건 비워둔다.",
];

/**
 * 핀 인물 후보 — 큐레이션 시드(FAMOUS_QUOTES_SEED)에 자주 등장하는 분야별 대표 멘토.
 * 사용자가 한 명을 선택하면 매주 일부 요일에 그 인물의 명언이 우선 노출된다.
 * "자동 회전" 선택 시 매주 8명 안팎의 풀이 결정론적으로 회전.
 */
const PIN_AUTHORS: Array<{ name: string; tag: string; tone: string }> = [
  { name: "스티브 잡스", tag: "비전 · 단순함", tone: "단호하고 직관적" },
  { name: "앨버트 아인슈타인", tag: "호기심 · 사고", tone: "위트와 깊이" },
  { name: "마르쿠스 아우렐리우스", tag: "스토아 · 자기절제", tone: "차분한 자기성찰" },
  { name: "마야 안젤루", tag: "내면 · 회복", tone: "따뜻하고 단단함" },
  { name: "워런 버핏", tag: "투자 · 인내", tone: "현실적이고 유머있게" },
  { name: "이어령", tag: "사유 · 한국어", tone: "한국어로 깊게" },
];

const PIN_DAYS_DEFAULT = 4;

export default function OnboardingPage() {
  const router = useRouter();
  const { user, firebaseUser, loading: authLoading, refreshUser } = useAuth();

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [futurePersona, setFuturePersona] = useState("");
  const [goals, setGoals] = useState<string[]>([""]);
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

  const goNext = () => setStep((s) => (s < TOTAL_STEPS ? ((s + 1) as 1 | 2 | 3 | 4) : s));
  const goBack = () => setStep((s) => (s > 1 ? ((s - 1) as 1 | 2 | 3 | 4) : s));

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
      if (futurePersona.trim()) {
        await updateFuturePersona(uid, futurePersona.trim());
      }
      const cleanedGoals = goals.map((g) => g.trim()).filter((g) => g.length > 0);
      if (cleanedGoals.length > 0) {
        await updateUserGoals(uid, cleanedGoals);
      }
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
          throw new Error(data.error || `요청 실패 (${res.status})`);
        }
        setPreview(data.motivation);
      } catch (err) {
        setPreviewError(err instanceof Error ? err.message : String(err));
      } finally {
        setPreviewLoading(false);
      }

      setSaving(false);
      setStep(4);
    } catch (err) {
      console.error("[onboarding] 저장 실패:", err);
      const msg = err instanceof Error ? err.message : String(err);
      setError(`저장에 실패했어요. (${msg})`);
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
            {Array.from({ length: TOTAL_STEPS }).map((_, i) => {
              const n = i + 1;
              return (
                <span
                  key={n}
                  className={`h-1.5 w-8 rounded-full transition-colors ${
                    n <= step ? "bg-[#1E1B4B]" : "bg-black/10"
                  }`}
                />
              );
            })}
            <span className="ml-3 text-[12px] font-medium tracking-[-0.01em] text-black/60">
              {step} / {TOTAL_STEPS}
            </span>
          </div>
          {step < 4 && (
            <button
              type="button"
              onClick={handleSkip}
              disabled={saving}
              className="text-[13px] font-medium tracking-[-0.01em] text-black/48 hover:text-black/70 disabled:opacity-50"
            >
              건너뛰기
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-8 sm:px-6 sm:py-12">
        <div className="mx-auto max-w-2xl">
          {step === 1 && (
            <div>
              <h1 className="text-[28px] font-semibold leading-[1.14] tracking-[-0.003em] text-[#1E1B4B] sm:text-[32px]">
                10년 후의 너의 모습은 어떤가요?
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
            </div>
          )}

          {step === 2 && (
            <div>
              <h1 className="text-[28px] font-semibold leading-[1.14] tracking-[-0.003em] text-[#1E1B4B] sm:text-[32px]">
                지금 향하고 있는 목표를 적어주세요
              </h1>
              <p className="mt-2 text-[15px] leading-[1.47] tracking-[-0.022em] text-black/60">
                앞 3개 목표가 매일 동기부여 카드와 잠금화면에 함께 표시돼요. 우선순위대로.
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
            </div>
          )}

          {step === 3 && (
            <div>
              <h1 className="text-[28px] font-semibold leading-[1.14] tracking-[-0.003em] text-[#1E1B4B] sm:text-[32px]">
                매일 누구의 한 마디를 듣고 싶나요?
              </h1>
              <p className="mt-2 text-[15px] leading-[1.47] tracking-[-0.022em] text-black/60">
                한 명을 정해두면 주 4일은 그 인물의 명언이 우선 도착해요. 나머지 요일과 자동 회전은 큐레이션이 골라줍니다. 비워둬도 좋아요.
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
                    자동 회전
                  </p>
                  <p className="mt-0.5 text-[12px] tracking-[-0.005em] text-black/55">
                    매주 8명 안팎의 멘토가 결정론적으로 바뀝니다.
                  </p>
                </button>
                {PIN_AUTHORS.map((a) => (
                  <button
                    key={a.name}
                    type="button"
                    onClick={() => setPinnedAuthor(a.name)}
                    className={`rounded-[14px] border px-4 py-3 text-left transition-all ${
                      pinnedAuthor === a.name
                        ? "border-[#1E1B4B] bg-[#1E1B4B]/[0.04]"
                        : "border-black/10 bg-white hover:border-[#1E1B4B]/40"
                    }`}
                  >
                    <p className="text-[14px] font-semibold tracking-[-0.015em] text-[#1E1B4B]">
                      {a.name}
                    </p>
                    <p className="mt-0.5 text-[11px] font-medium uppercase tracking-[0.08em] text-[#1E1B4B]/60">
                      {a.tag}
                    </p>
                    <p className="mt-1 text-[12px] tracking-[-0.005em] text-black/55">
                      {a.tone}
                    </p>
                  </button>
                ))}
              </div>

              <p className="mt-4 text-[12px] leading-[1.5] tracking-[-0.01em] text-black/48">
                나중에 설정에서 언제든 바꾸거나 끌 수 있어요.
              </p>
            </div>
          )}

          {step === 4 && (
            <div>
              <h1 className="text-[28px] font-semibold leading-[1.14] tracking-[-0.003em] text-[#1E1B4B] sm:text-[32px]">
                {previewLoading ? "오늘의 한 마디를 만들고 있어요…" : "이게 매일 너에게 도착해요."}
              </h1>
              <p className="mt-2 text-[15px] leading-[1.47] tracking-[-0.022em] text-black/60">
                {previewLoading
                  ? "잠시만 기다려주세요."
                  : "잠금화면 위젯이 매일 다른 한 줄을 보여줍니다. 안드로이드 앱을 설치하면 위젯을 추가할 수 있어요."}
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
                    오늘의 한 마디
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
                </div>
              )}

              {!previewLoading && previewError && (
                <p className="mt-6 text-center text-[13px] tracking-[-0.01em] text-[#D85A30]">
                  카드 미리보기를 만들지 못했어요. 시작 후 홈에서 다시 시도해 주세요. ({previewError})
                </p>
              )}

              <div className="mt-8 rounded-[14px] border border-black/[0.06] bg-white p-4">
                <p className="text-[13px] font-semibold tracking-[-0.01em] text-[#1E1B4B]">
                  안드로이드에서 위젯 추가하는 법
                </p>
                <ol className="mt-2 space-y-1 text-[12px] leading-[1.6] tracking-[-0.005em] text-black/60">
                  <li>1. 홈 화면 빈 곳을 길게 누름</li>
                  <li>2. &ldquo;위젯&rdquo; 메뉴 → Anima 검색</li>
                  <li>3. 잠금화면에 추가하면 매일 자동으로 한 줄이 도착해요</li>
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
            disabled={step === 1 || saving || step === 4}
            className="rounded-pill px-4 py-2.5 text-[14px] font-medium tracking-[-0.01em] text-black/70 transition-colors hover:bg-black/[0.04] disabled:opacity-30"
          >
            이전
          </button>
          {step < 3 && (
            <button
              type="button"
              onClick={goNext}
              disabled={saving}
              className="rounded-pill bg-[#1E1B4B] px-6 py-2.5 text-[14px] font-medium tracking-[-0.01em] text-white transition-colors hover:bg-[#2A2766] disabled:opacity-50"
            >
              다음
            </button>
          )}
          {step === 3 && (
            <button
              type="button"
              onClick={saveAndPreview}
              disabled={saving}
              className="rounded-pill bg-[#1E1B4B] px-6 py-2.5 text-[14px] font-medium tracking-[-0.01em] text-white transition-colors hover:bg-[#2A2766] disabled:opacity-50"
            >
              {saving ? "준비 중…" : "오늘의 한 마디 받기 →"}
            </button>
          )}
          {step === 4 && (
            <button
              type="button"
              onClick={finish}
              disabled={saving}
              className="rounded-pill bg-[#1E1B4B] px-6 py-2.5 text-[14px] font-medium tracking-[-0.01em] text-white transition-colors hover:bg-[#2A2766] disabled:opacity-50"
            >
              {saving ? "마무리 중…" : "시작하기"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
