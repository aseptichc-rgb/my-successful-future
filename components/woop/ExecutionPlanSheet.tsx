"use client";

import { useState } from "react";
import Sheet from "@/components/ui/Sheet";
import WhyIfThen from "@/components/woop/WhyIfThen";
import {
  saveExecutionPlan,
  deleteExecutionPlan,
  EXECUTION_PLAN_FIELD_MAX,
  type ExecutionPlanWithId,
} from "@/lib/firebase";
import { authedFetch } from "@/lib/authedFetch";
import { notifyAndroidWidgetRefresh } from "@/lib/widgetBridge";
import { refreshIosWidget } from "@/lib/iosWidget";
import { useT } from "@/lib/i18n";

/* ─────────────────────────────────────────────────────────────────
 * ExecutionPlanSheet — WOOP(소망→결과→장애물→계획) 실행설계 편집 시트.
 *
 * MCII(심상대비+실행의도): 긍정 상상(outcome) 뒤에 반드시 "내 안의 장애물"을
 * 마주하고 if-then 으로 잇는다 — 순수 긍정 상상만으로는 실행이 늘지 않는다
 * (Kappes & Oettingen 2011).
 *
 * 두 가지 경로가 있고 **기본은 빠른 설계**다:
 *  · quick : 목표 선택 → 초안 3개 받기 → 카드 탭 → 저장. 자유입력 0회(총 3탭).
 *            목표당 4칸을 직접 쓰게 하면 목표 3개에 12칸이 되어 아무도 끝내지 못한다.
 *  · wizard: 기존 4단계(소망→결과→장애물→계획) 위저드 — "직접 다듬기" 로 진입.
 *            수정 모드(existingPlan)는 항상 이쪽으로 바로 들어간다.
 * ───────────────────────────────────────────────────────────────── */

const STEPS = ["wish", "outcome", "obstacle", "plan"] as const;
type Step = (typeof STEPS)[number];

/** quick = 초안 선택 경로, wizard = 4단계 직접 작성 경로. */
type Mode = "quick" | "wizard";

interface ObstacleSuggestion {
  /** 신규 필드 — 구버전 서버 응답엔 없을 수 있어 optional 로 받는다. */
  outcome?: string;
  obstacle: string;
  ifText: string;
  thenText: string;
}

export default function ExecutionPlanSheet({
  uid,
  goals,
  identityLabels,
  existingPlan,
  initialGoal,
  onClose,
  onSaved,
}: {
  uid: string;
  /** 소망 단계에서 고르는 목표 풀 (User.goals). */
  goals: string[];
  /** 계획 단계의 정체성 칩 풀 (User.identities.labels — 없으면 섹션 숨김). */
  identityLabels: string[];
  /** 수정 모드일 때 기존 플랜. null/undefined = 신규. */
  existingPlan?: ExecutionPlanWithId | null;
  /** "설계하기" 진입 시 미리 선택할 목표. */
  initialGoal?: string | null;
  onClose: () => void;
  /** 저장/삭제 성공 후 호출 (목록 갱신은 onSnapshot 이 처리 — 토스트 용도). */
  onSaved?: () => void;
}) {
  const t = useT();
  // 수정 모드는 이미 내용이 있으니 위저드로 직행한다. 신규는 빠른 설계가 기본.
  const [mode, setMode] = useState<Mode>(existingPlan ? "wizard" : "quick");
  const [stepIdx, setStepIdx] = useState(0);
  const [goal, setGoal] = useState(existingPlan?.goal ?? initialGoal ?? "");
  const [outcome, setOutcome] = useState(existingPlan?.outcome ?? "");
  const [obstacle, setObstacle] = useState(existingPlan?.obstacle ?? "");
  const [ifText, setIfText] = useState(existingPlan?.ifText ?? "");
  const [thenText, setThenText] = useState(existingPlan?.thenText ?? "");
  const [identityTag, setIdentityTag] = useState(existingPlan?.identityTag ?? "");
  const [suggestions, setSuggestions] = useState<ObstacleSuggestion[] | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  /** 빠른 설계에서 고른 초안 인덱스 — null 이면 아직 저장할 수 없다. */
  const [pickedIdx, setPickedIdx] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 단계/경로 이동 시 이전 화면의 오류 문구는 무효 — 이동을 일으키는 지점에서 함께 지운다.
  // (호출부가 이미 범위를 지키므로 여기서 다시 clamp 하지 않는다.)
  const moveToStep = (next: number) => {
    setStepIdx(next);
    setError(null);
  };

  const step: Step = STEPS[stepIdx];
  const cleanGoals = goals.map((g) => g.trim()).filter((g) => g.length > 0);

  const canNext =
    step === "wish"
      ? goal.trim().length > 0
      : step === "outcome"
        ? outcome.trim().length > 0
        : step === "obstacle"
          ? obstacle.trim().length > 0
          : ifText.trim().length > 0 && thenText.trim().length > 0;

  /** 저장 가능 조건 — 두 경로가 공유한다. if-then 이 플랜의 본질이므로 그 둘 + 목표만 요구. */
  const canSave =
    goal.trim().length > 0 && ifText.trim().length > 0 && thenText.trim().length > 0;

  const handleSuggest = async () => {
    if (suggesting || !goal.trim()) return;
    setSuggesting(true);
    setError(null);
    try {
      const res = await authedFetch("/api/execution-plan/obstacles", {
        method: "POST",
        body: JSON.stringify({ goal: goal.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        suggestions?: ObstacleSuggestion[];
        error?: string;
      };
      if (!res.ok || !data.ok || !Array.isArray(data.suggestions)) {
        throw new Error(data.error || t("woop.suggestFailed"));
      }
      setSuggestions(data.suggestions);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("woop.suggestFailed"));
    } finally {
      setSuggesting(false);
    }
  };

  /**
   * 초안 하나를 플랜 필드 전체에 적용한다.
   * outcome 은 구버전 서버 응답에 없을 수 있어 있을 때만 덮어쓴다
   * (없으면 위저드에서 사용자가 채우거나 빈 값으로 저장된다 — 저장 자체는 막지 않는다).
   */
  const handleApplySuggestion = (s: ObstacleSuggestion, idx: number) => {
    if (s.outcome) setOutcome(s.outcome);
    setObstacle(s.obstacle);
    setIfText(s.ifText);
    setThenText(s.thenText);
    setPickedIdx(idx);
  };

  /** 빠른 설계 → 직접 다듬기. 목표가 이미 정해졌으면 소망 단계를 건너뛴다. */
  const switchToWizard = () => {
    setMode("wizard");
    moveToStep(goal.trim().length > 0 ? 1 : 0);
  };

  const handleSave = async () => {
    if (saving || !canSave) return;
    setSaving(true);
    setError(null);
    try {
      await saveExecutionPlan(uid, existingPlan?.id ?? null, {
        goal,
        outcome,
        obstacle,
        ifText,
        thenText,
        identityTag: identityTag || undefined,
        active: existingPlan?.active ?? true,
      });
      // 위젯도 새 if-then 을 받아가야 한다 (오늘의 플랜 회전 대상 변경).
      notifyAndroidWidgetRefresh();
      void refreshIosWidget();
      onSaved?.();
      onClose();
    } catch (err) {
      console.error("[woop] 저장 실패:", err);
      setError(t("woop.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!existingPlan || saving) return;
    setSaving(true);
    setError(null);
    try {
      await deleteExecutionPlan(uid, existingPlan.id);
      notifyAndroidWidgetRefresh();
      void refreshIosWidget();
      onSaved?.();
      onClose();
    } catch (err) {
      console.error("[woop] 삭제 실패:", err);
      setError(t("woop.saveFailed"));
      setSaving(false);
    }
  };

  const stepTitle =
    step === "wish"
      ? t("woop.step.wish")
      : step === "outcome"
        ? t("woop.step.outcome")
        : step === "obstacle"
          ? t("woop.step.obstacle")
          : t("woop.step.plan");

  const inputClass =
    "w-full rounded-[10px] bg-[var(--bg-grouped-2)] px-4 py-3 text-[17px] leading-[22px] tracking-[-0.43px] text-[var(--label)] placeholder:text-[var(--label-3)] focus:outline-none";

  /* ───── 목표 선택 행 — quick 과 wizard 의 소망 단계가 공유 ───── */
  const goalPicker = (
    <div className="bg-[var(--bg-grouped-2)] rounded-[12px] overflow-hidden">
      {cleanGoals.map((g, idx) => {
        const selected = goal.trim() === g;
        const isLast = idx === cleanGoals.length - 1;
        return (
          <button
            key={idx}
            type="button"
            onClick={() => {
              setGoal(g);
              // 목표가 바뀌면 이전 목표로 받은 초안은 더 이상 맞지 않는다.
              setSuggestions(null);
              setPickedIdx(null);
            }}
            className="relative w-full flex items-center gap-3 px-4 py-3 text-left"
          >
            <span
              className="w-[22px] h-[22px] rounded-full flex-shrink-0 flex items-center justify-center"
              style={{
                border: selected ? "none" : "1.6px solid #C7C7CC",
                background: selected ? "#D85A30" : "transparent",
              }}
            >
              {selected && (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12l5 5L20 7" />
                </svg>
              )}
            </span>
            <span className="flex-1 text-[17px] leading-[22px] tracking-[-0.43px] text-[var(--label)]">
              {g}
            </span>
            {!isLast && (
              <span
                className="absolute bottom-0 right-0 h-[0.5px]"
                style={{ left: 50, background: "var(--sep)" }}
              />
            )}
          </button>
        );
      })}
    </div>
  );

  /* ───── 경로 1: 빠른 설계 — 목표 선택 → 초안 3개 → 탭 → 저장 (키보드 0회) ───── */
  if (mode === "quick") {
    return (
      <Sheet onClose={onClose} title={t("woop.quick.title")}>
        <WhyIfThen />
        <p className="text-[13px] leading-[18px] text-[var(--label-2)] pb-3">
          {suggestions ? t("woop.quick.pickDraft") : t("woop.quick.pickGoal")}
        </p>

        {cleanGoals.length === 0 ? (
          <p className="text-[15px] text-[var(--label-3)] py-4">{t("woop.wish.empty")}</p>
        ) : (
          goalPicker
        )}

        {/* 초안 받기 — 목표를 고른 뒤에만 활성 */}
        {cleanGoals.length > 0 && (
          <div className="mt-4">
            <button
              type="button"
              onClick={handleSuggest}
              disabled={suggesting || goal.trim().length === 0}
              className="inline-flex items-center gap-1.5 rounded-full px-4 py-2.5 text-[15px] font-semibold text-[var(--soul)] disabled:opacity-40"
              style={{ background: "rgba(216,90,48,0.10)" }}
            >
              <span aria-hidden>✦</span>
              {suggesting ? t("woop.quick.drafting") : t("woop.quick.draftCta")}
            </button>
          </div>
        )}

        {/* 초안 카드 — 탭하면 outcome/obstacle/if/then 이 한 번에 채워진다 */}
        {suggestions && (
          <div className="mt-3 space-y-2">
            {suggestions.map((s, i) => {
              const picked = pickedIdx === i;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => handleApplySuggestion(s, i)}
                  className="w-full rounded-[12px] px-4 py-3 text-left transition-colors"
                  style={{
                    background: picked ? "rgba(216,90,48,0.10)" : "var(--bg-grouped-2)",
                    boxShadow: picked ? "inset 0 0 0 1.5px #D85A30" : "none",
                  }}
                >
                  {s.outcome && (
                    <>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--label-3)]">
                        {t("woop.quick.outcomeLabel")}
                      </p>
                      <p className="mt-0.5 text-[15px] leading-[20px] font-medium text-[var(--label)]">
                        {s.outcome}
                      </p>
                    </>
                  )}
                  <p
                    className={`text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--label-3)] ${s.outcome ? "mt-2.5" : ""}`}
                  >
                    {t("woop.quick.obstacleLabel")}
                  </p>
                  <p className="mt-0.5 text-[15px] leading-[20px] text-[var(--label)]">
                    {s.obstacle}
                  </p>
                  <p className="mt-2 text-[13px] leading-[18px] text-[var(--label-2)]">
                    {t("plan.today.if")} {s.ifText} → {s.thenText}
                  </p>
                </button>
              );
            })}
          </div>
        )}

        {error && <p className="mt-3 text-[13px] text-[#FF3B30]">{error}</p>}

        <div className="mt-5 flex items-center gap-3">
          <button
            type="button"
            onClick={switchToWizard}
            disabled={saving}
            className="text-[15px] font-medium text-[var(--label-2)] disabled:opacity-40"
          >
            {t("woop.quick.manual")}
          </button>
          <div className="flex-1" />
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave || saving}
            className="rounded-full px-5 py-2.5 text-[15px] font-semibold text-white disabled:opacity-30"
            style={{ background: "#D85A30" }}
          >
            {saving ? t("woop.saving") : t("woop.quick.saveDraft")}
          </button>
        </div>
      </Sheet>
    );
  }

  /* ───── 경로 2: 4단계 위저드 (직접 작성 / 기존 플랜 수정) ───── */
  return (
    <Sheet onClose={onClose} title={t("woop.sheet.title")}>
      <WhyIfThen />
      {/* 단계 도트 + 단계명 */}
      <div className="flex items-center gap-2 pb-3">
        {STEPS.map((s, i) => (
          <div
            key={s}
            className="h-[6px] flex-1 rounded-full transition-colors"
            style={{ background: i <= stepIdx ? "#D85A30" : "rgba(0,0,0,0.08)" }}
            aria-hidden
          />
        ))}
      </div>
      <p className="text-[17px] font-semibold tracking-[-0.43px] text-[var(--label)] pb-1">
        {stepTitle}
      </p>

      {/* ── 1. 소망: 목표 선택 ── */}
      {step === "wish" && (
        <div>
          <p className="text-[13px] leading-[18px] text-[var(--label-2)] pb-3">
            {t("woop.wish.hint")}
          </p>
          {cleanGoals.length === 0 ? (
            <p className="text-[15px] text-[var(--label-3)] py-4">{t("woop.wish.empty")}</p>
          ) : (
            goalPicker
          )}
        </div>
      )}

      {/* ── 2. 최상의 결과 ── */}
      {step === "outcome" && (
        <div>
          <p className="text-[13px] leading-[18px] text-[var(--label-2)] pb-3">
            {t("woop.outcome.hint")}
          </p>
          <textarea
            value={outcome}
            rows={3}
            maxLength={EXECUTION_PLAN_FIELD_MAX}
            onChange={(e) => setOutcome(e.target.value)}
            placeholder={t("woop.outcome.placeholder")}
            className={`${inputClass} resize-none`}
          />
          <p className="mt-1 text-right text-[12px] text-[var(--label-3)] tabular-nums">
            {outcome.length}/{EXECUTION_PLAN_FIELD_MAX}
          </p>
        </div>
      )}

      {/* ── 3. 내 안의 장애물 (+ AI 제안) ── */}
      {step === "obstacle" && (
        <div>
          <p className="text-[13px] leading-[18px] text-[var(--label-2)] pb-3">
            {t("woop.obstacle.hint")}
          </p>
          <textarea
            value={obstacle}
            rows={3}
            maxLength={EXECUTION_PLAN_FIELD_MAX}
            onChange={(e) => setObstacle(e.target.value)}
            placeholder={t("woop.obstacle.placeholder")}
            className={`${inputClass} resize-none`}
          />
          <div className="mt-3">
            <button
              type="button"
              onClick={handleSuggest}
              disabled={suggesting}
              className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[15px] font-semibold text-[var(--soul)] disabled:opacity-40"
              style={{ background: "rgba(216,90,48,0.10)" }}
            >
              <span aria-hidden>✦</span>
              {suggesting ? t("woop.obstacle.suggesting") : t("woop.obstacle.suggest")}
            </button>
          </div>
          {suggestions && (
            <div className="mt-3 space-y-2">
              {suggestions.map((s, i) => {
                const applied = obstacle === s.obstacle && ifText === s.ifText;
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => handleApplySuggestion(s, i)}
                    className="w-full rounded-[10px] px-4 py-3 text-left transition-colors"
                    style={{
                      background: applied ? "rgba(216,90,48,0.10)" : "var(--bg-grouped-2)",
                      boxShadow: applied ? "inset 0 0 0 1.5px #D85A30" : "none",
                    }}
                  >
                    <p className="text-[15px] leading-[20px] font-medium text-[var(--label)]">
                      {s.obstacle}
                    </p>
                    <p className="mt-1 text-[13px] leading-[18px] text-[var(--label-2)]">
                      {t("plan.today.if")} {s.ifText} → {s.thenText}
                    </p>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── 4. if-then 계획 + 정체성 ── */}
      {step === "plan" && (
        <div className="space-y-3">
          <div>
            <p className="text-[13px] font-medium text-[var(--label-2)] pb-1.5">
              {t("woop.plan.ifLabel")}
            </p>
            <textarea
              value={ifText}
              rows={2}
              maxLength={EXECUTION_PLAN_FIELD_MAX}
              onChange={(e) => setIfText(e.target.value)}
              placeholder={t("woop.plan.ifPlaceholder")}
              className={`${inputClass} resize-none`}
            />
          </div>
          <div>
            <p className="text-[13px] font-medium text-[var(--label-2)] pb-1.5">
              {t("woop.plan.thenLabel")}
            </p>
            <textarea
              value={thenText}
              rows={2}
              maxLength={EXECUTION_PLAN_FIELD_MAX}
              onChange={(e) => setThenText(e.target.value)}
              placeholder={t("woop.plan.thenPlaceholder")}
              className={`${inputClass} resize-none`}
            />
          </div>
          {identityLabels.length > 0 && (
            <div>
              <p className="text-[13px] font-medium text-[var(--label-2)] pb-1.5">
                {t("woop.identity.pickLabel")}
              </p>
              <div className="flex flex-wrap gap-2">
                {identityLabels.map((label) => {
                  const selected = identityTag === label;
                  return (
                    <button
                      key={label}
                      type="button"
                      onClick={() => setIdentityTag(selected ? "" : label)}
                      className="rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors"
                      style={{
                        background: selected ? "#1E1B4B" : "rgba(30,27,75,0.08)",
                        color: selected ? "#FFFFFF" : "#1E1B4B",
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {error && <p className="mt-3 text-[13px] text-[#FF3B30]">{error}</p>}

      {/* ── 하단 내비게이션 ── */}
      <div className="mt-5 flex items-center gap-3">
        {existingPlan && step === "plan" && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={saving}
            className="text-[15px] font-medium text-[#FF3B30] disabled:opacity-40"
          >
            {t("woop.delete")}
          </button>
        )}
        <div className="flex-1" />
        {stepIdx > 0 && (
          <button
            type="button"
            onClick={() => moveToStep(stepIdx - 1)}
            disabled={saving}
            className="rounded-full px-5 py-2.5 text-[15px] font-semibold text-[var(--label-2)]"
            style={{ background: "rgba(0,0,0,0.05)" }}
          >
            {t("common.prev")}
          </button>
        )}
        {step !== "plan" ? (
          <button
            type="button"
            onClick={() => canNext && moveToStep(stepIdx + 1)}
            disabled={!canNext}
            className="rounded-full px-5 py-2.5 text-[15px] font-semibold text-white disabled:opacity-30"
            style={{ background: "#D85A30" }}
          >
            {t("common.next")}
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSave}
            disabled={!canNext || saving}
            className="rounded-full px-5 py-2.5 text-[15px] font-semibold text-white disabled:opacity-30"
            style={{ background: "#D85A30" }}
          >
            {saving ? t("woop.saving") : t("woop.save")}
          </button>
        )}
      </div>
    </Sheet>
  );
}
