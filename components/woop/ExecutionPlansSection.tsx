"use client";

import { useState } from "react";
import GroupedSection from "@/components/ui/GroupedSection";
import ExecutionPlanSheet from "@/components/woop/ExecutionPlanSheet";
import type { ExecutionPlanWithId } from "@/lib/firebase";
import { useT } from "@/lib/i18n";

/* ─────────────────────────────────────────────────────────────────
 * ExecutionPlansSection — "실행 설계 (if-then)" 인셋 목록.
 *  · 플랜이 있는 목표: goal + "if… → then…" 축약행 (탭 → 수정 시트)
 *  · 플랜이 없는 목표: "설계하기" CTA 행 (탭 → 신규 시트, 목표 미리 선택)
 * 홈 "나의 행동" 탭과 설정이 함께 쓴다 — 순수 표현 컴포넌트(구독은 호출부).
 * ───────────────────────────────────────────────────────────────── */

export default function ExecutionPlansSection({
  uid,
  goals,
  identityLabels,
  plans,
}: {
  uid: string;
  goals: string[];
  identityLabels: string[];
  plans: ExecutionPlanWithId[];
}) {
  const t = useT();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<ExecutionPlanWithId | null>(null);
  const [initialGoal, setInitialGoal] = useState<string | null>(null);

  const cleanGoals = goals.map((g) => g.trim()).filter((g) => g.length > 0);
  // 목표 텍스트(trim) → 플랜 매핑. 목표가 지워진 플랜(고아)도 목록엔 계속 보여준다.
  const planByGoal = new Map<string, ExecutionPlanWithId>();
  for (const p of plans) planByGoal.set(p.goal.trim(), p);
  const orphanPlans = plans.filter((p) => !cleanGoals.includes(p.goal.trim()));

  const openCreate = (goal: string | null) => {
    setEditingPlan(null);
    setInitialGoal(goal);
    setSheetOpen(true);
  };
  const openEdit = (plan: ExecutionPlanWithId) => {
    setEditingPlan(plan);
    setInitialGoal(null);
    setSheetOpen(true);
  };

  // 목표도 플랜도 없으면 섹션 자체를 숨긴다 (목표 CTA 는 기존 목표 섹션이 담당).
  if (cleanGoals.length === 0 && plans.length === 0) return null;

  const rows: Array<
    | { kind: "plan"; goal: string; plan: ExecutionPlanWithId }
    | { kind: "empty"; goal: string }
  > = [
    ...cleanGoals.map((g) => {
      const plan = planByGoal.get(g);
      return plan
        ? ({ kind: "plan", goal: g, plan } as const)
        : ({ kind: "empty", goal: g } as const);
    }),
    ...orphanPlans.map((p) => ({ kind: "plan", goal: p.goal.trim(), plan: p }) as const),
  ];

  return (
    <>
      <GroupedSection header={t("woop.section.title")} footer={t("woop.section.footer")}>
        {rows.map((row, idx) => {
          const isLast = idx === rows.length - 1;
          return (
            <button
              key={`${row.kind}-${row.goal}-${idx}`}
              type="button"
              onClick={() => (row.kind === "plan" ? openEdit(row.plan) : openCreate(row.goal))}
              className="relative w-full flex items-start gap-3 px-4 py-3 text-left"
            >
              <span
                className="w-9 h-9 rounded-[10px] flex items-center justify-center flex-shrink-0 mt-0.5 text-[15px]"
                style={{
                  background: row.kind === "plan" ? "rgba(216,90,48,0.12)" : "rgba(0,0,0,0.05)",
                }}
                aria-hidden
              >
                {row.kind === "plan" ? "⚡" : "＋"}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-[15px] leading-[20px] font-medium tracking-[-0.24px] text-[var(--label)] truncate">
                  {row.goal}
                </span>
                {row.kind === "plan" ? (
                  <span className="block mt-0.5 text-[13px] leading-[18px] tracking-[-0.08px] text-[var(--label-2)]">
                    {t("plan.today.if")} {row.plan.ifText} → {row.plan.thenText}
                  </span>
                ) : (
                  <span className="block mt-0.5 text-[13px] leading-[18px] text-[var(--soul)] font-medium">
                    {t("woop.section.designCta")}
                  </span>
                )}
              </span>
              {!isLast && (
                <span
                  className="absolute bottom-0 right-0 h-[0.5px]"
                  style={{ left: 60, background: "var(--sep)" }}
                />
              )}
            </button>
          );
        })}
      </GroupedSection>

      {sheetOpen && (
        <ExecutionPlanSheet
          uid={uid}
          goals={cleanGoals}
          identityLabels={identityLabels}
          existingPlan={editingPlan}
          initialGoal={initialGoal}
          onClose={() => setSheetOpen(false)}
        />
      )}
    </>
  );
}
