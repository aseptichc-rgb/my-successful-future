"use client";

import { useEffect, useState } from "react";
import Sheet from "@/components/ui/Sheet";
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
 * ExecutionPlanSheet — WOOP(소망→결과→장애물→계획) 4단계 실행설계 편집 시트.
 *
 * MCII(심상대비+실행의도): 긍정 상상(outcome) 뒤에 반드시 "내 안의 장애물"을
 * 마주하고 if-then 으로 잇는다 — 순수 긍정 상상만으로는 실행이 늘지 않는다
 * (Kappes & Oettingen 2011). 장애물 단계에서 AI 제안 3개를 받아 탭 한 번으로
 * obstacle/if/then 을 채울 수 있다(/api/execution-plan/obstacles).
 * ───────────────────────────────────────────────────────────────── */

const STEPS = ["wish", "outcome", "obstacle", "plan"] as const;
type Step = (typeof STEPS)[number];

interface ObstacleSuggestion {
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
  const [stepIdx, setStepIdx] = useState(0);
  const [goal, setGoal] = useState(existingPlan?.goal ?? initialGoal ?? "");
  const [outcome, setOutcome] = useState(existingPlan?.outcome ?? "");
  const [obstacle, setObstacle] = useState(existingPlan?.obstacle ?? "");
  const [ifText, setIfText] = useState(existingPlan?.ifText ?? "");
  const [thenText, setThenText] = useState(existingPlan?.thenText ?? "");
  const [identityTag, setIdentityTag] = useState(existingPlan?.identityTag ?? "");
  const [suggestions, setSuggestions] = useState<ObstacleSuggestion[] | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 단계 이동 시 이전 단계의 오류 문구는 무효.
  useEffect(() => {
    setError(null);
  }, [stepIdx]);

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

  const handleApplySuggestion = (s: ObstacleSuggestion) => {
    setObstacle(s.obstacle);
    setIfText(s.ifText);
    setThenText(s.thenText);
  };

  const handleSave = async () => {
    if (saving || !canNext) return;
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

  return (
    <Sheet onClose={onClose} title={t("woop.sheet.title")}>
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
            <div className="bg-[var(--bg-grouped-2)] rounded-[12px] overflow-hidden">
              {cleanGoals.map((g, idx) => {
                const selected = goal.trim() === g;
                const isLast = idx === cleanGoals.length - 1;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setGoal(g)}
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
                    onClick={() => handleApplySuggestion(s)}
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
            onClick={() => setStepIdx((i) => Math.max(0, i - 1))}
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
            onClick={() => canNext && setStepIdx((i) => Math.min(STEPS.length - 1, i + 1))}
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
