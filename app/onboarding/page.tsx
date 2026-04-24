"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import {
  updateUserPersona,
  updateFuturePersona,
  updatePreferredTopics,
  markOnboarded,
} from "@/lib/firebase";
import { PERSONAS } from "@/lib/personas";
import { LABELS } from "@/lib/labels";
import type { NewsTopic, PersonaId } from "@/types";

// Step 1: 관심 주제 (preferredTopics 기본값 추천에도 쓰임)
const TOPICS: { id: NewsTopic; label: string; emoji: string; hint: string }[] = [
  { id: "국내", label: "국내", emoji: "🇰🇷", hint: "정치·경제·사회" },
  { id: "글로벌", label: "글로벌", emoji: "🌍", hint: "해외·국제" },
  { id: "IT", label: "IT", emoji: "💻", hint: "테크·스타트업" },
  { id: "헬스케어", label: "건강", emoji: "🏥", hint: "의료·바이오" },
];

// Step 3 자문단 추천 목록 (default·future-self 제외)
const ADVISOR_CANDIDATES: PersonaId[] = [
  "entrepreneur",
  "fund-trader",
  "tech-cto",
  "policy-analyst",
  "healthcare-expert",
];

const USER_PERSONA_EXAMPLES = [
  "30대 초반 개발자. 스타트업에서 서버 개발을 하고 있고, 요즘은 AI·투자에 관심이 많아요.",
  "20대 후반 대학원생. 디지털헬스케어 연구 중이에요. 창업도 고민 중.",
  "40대 직장인, 두 아이 아빠. 은퇴 후 제2의 커리어를 준비하고 있어요.",
];

const FUTURE_PERSONA_EXAMPLES = [
  "5년 뒤 월 1,000만 원을 벌며 원하는 시간에 원하는 일을 하고 있다. 매일 아침 운동과 독서로 하루를 시작한다.",
  "10년 뒤 분야에서 손꼽히는 전문가가 되어, 강연과 집필로도 영향력을 넓히고 있다.",
  "7년 뒤 가족과 보내는 시간이 최우선인 삶을 살고 있다. 일은 하루 5시간만 하고, 주말은 무조건 비워둔다.",
];

export default function OnboardingPage() {
  const router = useRouter();
  const { user, firebaseUser, loading: authLoading, refreshUser } = useAuth();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [topics, setTopics] = useState<NewsTopic[]>([]);
  const [userPersona, setUserPersona] = useState("");
  const [futurePersona, setFuturePersona] = useState("");
  const [selectedAdvisors, setSelectedAdvisors] = useState<PersonaId[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 미로그인 차단 + 이미 온보딩 완료했으면 홈으로
  useEffect(() => {
    if (authLoading) return;
    if (!firebaseUser) {
      router.replace("/login");
      return;
    }
    if (user?.onboardedAt) {
      router.replace("/chat");
    }
  }, [authLoading, firebaseUser, user?.onboardedAt, router]);

  // 관심사 기반 자문단 자동 추천 (Step 3 초기값)
  const recommendedAdvisors = useMemo<PersonaId[]>(() => {
    const set = new Set<PersonaId>();
    if (topics.includes("IT")) set.add("tech-cto");
    if (topics.includes("헬스케어")) set.add("healthcare-expert");
    if (topics.includes("글로벌")) set.add("fund-trader");
    if (topics.includes("국내")) set.add("policy-analyst");
    // 기본 2명 보장
    if (set.size < 2) set.add("entrepreneur");
    if (set.size < 2) set.add("fund-trader");
    return Array.from(set).slice(0, 3);
  }, [topics]);

  // Step 3 진입 시 추천 자동 체크
  useEffect(() => {
    if (step === 3 && selectedAdvisors.length === 0) {
      setSelectedAdvisors(recommendedAdvisors);
    }
  }, [step, recommendedAdvisors, selectedAdvisors.length]);

  const toggleTopic = (t: NewsTopic) => {
    setTopics((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t],
    );
  };

  const toggleAdvisor = (id: PersonaId) => {
    setSelectedAdvisors((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const goNext = () => setStep((s) => (s < 3 ? ((s + 1) as 1 | 2 | 3) : s));
  const goBack = () => setStep((s) => (s > 1 ? ((s - 1) as 1 | 2 | 3) : s));

  const finish = async () => {
    if (!firebaseUser) return;
    setSaving(true);
    setError(null);

    // 네트워크·SDK 문제로 await 가 영영 resolve 안 되는 경우를 방어하기 위한 타임아웃 헬퍼.
    // 개별 Firestore 쓰기마다 10초 한도를 둔다.
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

      console.debug("[onboarding] 저장 시작", { topicsLen: topics.length, hasUserPersona: !!userPersona.trim(), hasFuturePersona: !!futurePersona.trim() });

      // Step 1: 관심사 (선택 안 했으면 "전체"로 기본)
      await withTimeout(
        updatePreferredTopics(uid, topics.length > 0 ? topics : ["전체"]),
        "preferredTopics",
      );
      // Step 1 다음: 자기소개 (선택 사항)
      if (userPersona.trim()) {
        await withTimeout(updateUserPersona(uid, userPersona.trim()), "userPersona");
      }
      // Step 2: 미래의 나 (선택 사항)
      if (futurePersona.trim()) {
        await withTimeout(updateFuturePersona(uid, futurePersona.trim()), "futurePersona");
      }
      // Step 3 자문단 선택은 현재 persistent 저장 스키마 없음 → 홈 미니카드 추천은 preferredTopics 기반.
      await withTimeout(markOnboarded(uid), "markOnboarded");

      console.debug("[onboarding] Firestore 저장 완료, refreshUser 진행");

      // refreshUser 는 실패·지연해도 진행을 막지 않는다.
      // 갓 저장한 onboardedAt 이 auth-context user 에 반영되지 않으면
      // /chat 이 다시 /onboarding 으로 돌려보낼 수 있지만, 그래도 최소 한 번은 화면 전환이 일어난다.
      await withTimeout(refreshUser(), "refreshUser", 5000).catch((e) => {
        console.warn("[onboarding] refreshUser 실패 (진행 계속):", e);
      });

      console.debug("[onboarding] /chat 이동");
      router.replace("/chat");
      // 라우트 전환이 지연되는 드문 경우 대비 — 버튼 상태 풀어 사용자가 재시도 가능하게
      setSaving(false);
    } catch (err) {
      console.error("[onboarding] 저장 실패:", err);
      const msg = err instanceof Error ? err.message : String(err);
      setError(`저장에 실패했어요. (${msg}) 잠시 후 다시 시도해 주세요.`);
      setSaving(false);
    }
  };

  const handleSkip = async () => {
    // 완전 스킵: 관심사·자기소개·미래의 나 모두 미기입. 온보딩만 마킹.
    if (!firebaseUser) return;
    setSaving(true);
    try {
      await markOnboarded(firebaseUser.uid);
      await refreshUser().catch(() => {});
      router.replace("/chat");
    } catch (err) {
      console.error("[onboarding] skip 실패:", err);
      setSaving(false);
    }
  };

  if (authLoading || !firebaseUser) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f5f5f7]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-black/10 border-t-[#0071e3]" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#f5f5f7]">
      {/* 진행 바 */}
      <div className="sticky top-0 z-10 border-b border-black/[0.06] bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-5 py-3 sm:px-6">
          <div className="flex items-center gap-1.5">
            {[1, 2, 3].map((n) => (
              <span
                key={n}
                className={`h-1.5 w-8 rounded-full transition-colors ${
                  n <= step ? "bg-[#0071e3]" : "bg-black/10"
                }`}
              />
            ))}
            <span className="ml-3 text-[12px] font-medium tracking-[-0.01em] text-black/60">
              {step} / 3
            </span>
          </div>
          <button
            type="button"
            onClick={handleSkip}
            disabled={saving}
            className="text-[13px] font-medium tracking-[-0.01em] text-black/48 hover:text-black/70 disabled:opacity-50"
          >
            {LABELS.skip}
          </button>
        </div>
      </div>

      {/* 본문 */}
      <div className="flex-1 overflow-y-auto px-5 py-8 sm:px-6 sm:py-12">
        <div className="mx-auto max-w-2xl">
          {step === 1 && (
            <div>
              <h1 className="text-[28px] font-semibold leading-[1.14] tracking-[-0.003em] text-[#1d1d1f] sm:text-[32px]">
                {LABELS.currentSelf}는 어떤 사람인가요?
              </h1>
              <p className="mt-2 text-[15px] leading-[1.47] tracking-[-0.022em] text-black/60">
                AI가 대화에 반영할 수 있도록 간단히 알려주세요. 관심사와 자기소개 중 하나만 채워도 괜찮아요.
              </p>

              {/* 관심사 */}
              <h2 className="mt-8 text-[15px] font-semibold tracking-[-0.022em] text-[#1d1d1f]">
                요즘 관심 있는 주제
              </h2>
              <p className="mt-1 text-[13px] tracking-[-0.01em] text-black/56">
                복수 선택 가능
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {TOPICS.map((t) => {
                  const active = topics.includes(t.id);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => toggleTopic(t.id)}
                      className={`flex items-center gap-3 rounded-[14px] border px-4 py-3 text-left transition-colors ${
                        active
                          ? "border-[#0071e3] bg-[#0071e3]/5"
                          : "border-black/10 bg-white hover:border-black/20"
                      }`}
                    >
                      <span className="text-[22px]">{t.emoji}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[14px] font-semibold tracking-[-0.022em] text-[#1d1d1f]">
                          {t.label}
                        </p>
                        <p className="truncate text-[12px] tracking-[-0.01em] text-black/56">
                          {t.hint}
                        </p>
                      </div>
                      <span
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] border transition-colors ${
                          active ? "border-[#0071e3] bg-[#0071e3]" : "border-black/15"
                        }`}
                      >
                        {active && (
                          <svg
                            className="h-3 w-3 text-white"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={3}
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* 자기소개 */}
              <h2 className="mt-8 text-[15px] font-semibold tracking-[-0.022em] text-[#1d1d1f]">
                나를 한 줄로 소개한다면 <span className="font-normal text-black/48">(선택)</span>
              </h2>
              <textarea
                value={userPersona}
                onChange={(e) => setUserPersona(e.target.value)}
                rows={4}
                maxLength={500}
                placeholder="예: 30대 초반 개발자. 스타트업에서 서버 개발을 하고 있고, 요즘은 AI·투자에 관심이 많아요."
                className="mt-3 w-full resize-none rounded-[14px] border border-black/10 bg-white px-4 py-3 text-[14px] tracking-[-0.01em] text-[#1d1d1f] placeholder:text-black/40 focus:border-[#0071e3] focus:outline-none"
              />
              <div className="mt-3 flex flex-wrap gap-2">
                {USER_PERSONA_EXAMPLES.map((ex, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setUserPersona(ex)}
                    className="rounded-pill border border-black/10 bg-white px-3 py-1.5 text-[12px] tracking-[-0.01em] text-black/70 transition-colors hover:border-[#0071e3] hover:text-[#0071e3]"
                  >
                    {ex.length > 28 ? ex.slice(0, 28) + "…" : ex}
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 2 && (
            <div>
              <h1 className="text-[28px] font-semibold leading-[1.14] tracking-[-0.003em] text-[#1d1d1f] sm:text-[32px]">
                {LABELS.futureSelf}는 어떤 모습인가요?
              </h1>
              <p className="mt-2 text-[15px] leading-[1.47] tracking-[-0.022em] text-black/60">
                5년·10년 뒤 되고 싶은 모습을 자유롭게 적어주세요. 이 글이 오늘의 당신에게 메시지를 보내는 <strong className="font-semibold">미래의 나</strong>가 됩니다.
              </p>
              <textarea
                value={futurePersona}
                onChange={(e) => setFuturePersona(e.target.value)}
                rows={6}
                maxLength={500}
                placeholder="예: 5년 뒤 월 1,000만 원을 벌며 원하는 시간에 원하는 일을 하고 있다. 매일 아침 운동과 독서로 하루를 시작한다."
                className="mt-6 w-full resize-none rounded-[14px] border border-black/10 bg-white px-4 py-3 text-[14px] leading-[1.5] tracking-[-0.01em] text-[#1d1d1f] placeholder:text-black/40 focus:border-[#0071e3] focus:outline-none"
              />
              <div className="mt-2 text-right text-[11px] tracking-[-0.01em] text-black/40">
                {futurePersona.length}/500
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {FUTURE_PERSONA_EXAMPLES.map((ex, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setFuturePersona(ex)}
                    className="rounded-pill border border-black/10 bg-white px-3 py-1.5 text-[12px] tracking-[-0.01em] text-black/70 transition-colors hover:border-[#0071e3] hover:text-[#0071e3]"
                  >
                    {ex.length > 32 ? ex.slice(0, 32) + "…" : ex}
                  </button>
                ))}
              </div>
              <p className="mt-4 text-[12px] leading-[1.5] tracking-[-0.01em] text-black/48">
                비워둬도 괜찮아요. 나중에 <strong className="font-medium text-black/60">⚙️ 설정</strong>에서 언제든지 바꿀 수 있어요.
              </p>
            </div>
          )}

          {step === 3 && (
            <div>
              <h1 className="text-[28px] font-semibold leading-[1.14] tracking-[-0.003em] text-[#1d1d1f] sm:text-[32px]">
                나를 도와줄 {LABELS.advisors}을 골라볼까요?
              </h1>
              <p className="mt-2 text-[15px] leading-[1.47] tracking-[-0.022em] text-black/60">
                2명 이상 선택하면 나중에 <strong className="font-semibold">여러 명에게 한 번에</strong> 의견을 물을 수 있어요. 고른 분들이 홈에서 먼저 보입니다.
              </p>

              <div className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {ADVISOR_CANDIDATES.map((id) => {
                  const p = PERSONAS[id as keyof typeof PERSONAS];
                  const active = selectedAdvisors.includes(id);
                  const recommended = recommendedAdvisors.includes(id);
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => toggleAdvisor(id)}
                      className={`flex items-start gap-3 rounded-[14px] border p-4 text-left transition-colors ${
                        active
                          ? "border-[#0071e3] bg-[#0071e3]/5"
                          : "border-black/10 bg-white hover:border-black/20"
                      }`}
                    >
                      <span className="text-[28px] leading-none">{p.icon}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <p className="truncate text-[15px] font-semibold tracking-[-0.022em] text-[#1d1d1f]">
                            {p.name}
                          </p>
                          {recommended && (
                            <span className="shrink-0 rounded-pill bg-[#0071e3]/10 px-2 py-0.5 text-[10px] font-semibold tracking-[-0.01em] text-[#0071e3]">
                              추천
                            </span>
                          )}
                        </div>
                        <p className="mt-1 line-clamp-2 text-[12px] leading-[1.4] tracking-[-0.01em] text-black/56">
                          {p.description}
                        </p>
                      </div>
                      <span
                        className={`mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] border transition-colors ${
                          active ? "border-[#0071e3] bg-[#0071e3]" : "border-black/15"
                        }`}
                      >
                        {active && (
                          <svg
                            className="h-3 w-3 text-white"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={3}
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className="mt-4 text-[12px] leading-[1.5] tracking-[-0.01em] text-black/48">
                홈에 모든 자문단이 보여요. 여기서 고른 분들이 상단에 먼저 떠요.
              </p>
            </div>
          )}

          {error && (
            <p className="mt-5 text-center text-[13px] tracking-[-0.01em] text-[#ff3b30]">
              {error}
            </p>
          )}
        </div>
      </div>

      {/* 하단 네비 */}
      <div className="sticky bottom-0 border-t border-black/[0.06] bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-5 py-4 sm:px-6">
          <button
            type="button"
            onClick={goBack}
            disabled={step === 1 || saving}
            className="rounded-pill px-4 py-2.5 text-[14px] font-medium tracking-[-0.01em] text-black/70 transition-colors hover:bg-black/[0.04] disabled:opacity-30"
          >
            {LABELS.back}
          </button>
          {step < 3 ? (
            <button
              type="button"
              onClick={goNext}
              disabled={saving}
              className="rounded-pill bg-[#0071e3] px-6 py-2.5 text-[14px] font-medium tracking-[-0.01em] text-white transition-colors hover:bg-[#0077ed] disabled:opacity-50"
            >
              {LABELS.next}
            </button>
          ) : (
            <button
              type="button"
              onClick={finish}
              disabled={saving}
              className="rounded-pill bg-[#0071e3] px-6 py-2.5 text-[14px] font-medium tracking-[-0.01em] text-white transition-colors hover:bg-[#0077ed] disabled:opacity-50"
            >
              {saving ? "저장 중…" : `${LABELS.start} →`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
