"use client";

import { useState } from "react";
import GroupedSection from "@/components/ui/GroupedSection";
import ExecutionPlanSheet from "@/components/woop/ExecutionPlanSheet";
import type { ExecutionPlanWithId } from "@/lib/firebase";
import { useT } from "@/lib/i18n";

/* ─────────────────────────────────────────────────────────────────
 * ExecutionPlansSection — "실행 설계 (if-then)" 인셋 목록.
 *  · 플랜이 있는 목표: goal + "if… → then…" 축약행 (탭 → 수정 시트)
 *  · 플랜이 없는 목표: "설계하기" CTA 행 — **한 번에 하나만** 노출한다.
 *    빈 CTA 를 목표 수만큼 늘어놓으면 "해야 할 일 3개"로 읽혀 아무것도 시작되지 않는다
 *    (choice overload). 나머지는 "N개 더" 행을 눌러야 펼쳐진다.
 * 설정 화면이 쓴다(홈은 읽기 전용 DailyPlanCard 만) — 순수 표현 컴포넌트.
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
  /** 미설계 목표를 전부 펼쳤는지 — 기본은 접힘(빈 슬롯 1개만). */
  const [showAllEmpty, setShowAllEmpty] = useState(false);

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

  // 설계된 플랜은 전부 보여주고, 미설계 목표는 접힌 상태에선 첫 1개만 보여준다.
  const plannedRows = [
    ...cleanGoals
      .filter((g) => planByGoal.has(g))
      .map((g) => ({ kind: "plan", goal: g, plan: planByGoal.get(g)! }) as const),
    ...orphanPlans.map((p) => ({ kind: "plan", goal: p.goal.trim(), plan: p }) as const),
  ];
  const emptyGoals = cleanGoals.filter((g) => !planByGoal.has(g));
  const visibleEmptyGoals = showAllEmpty ? emptyGoals : emptyGoals.slice(0, 1);
  const hiddenEmptyCount = emptyGoals.length - visibleEmptyGoals.length;

  const rows: Array<
    | { kind: "plan"; goal: string; plan: ExecutionPlanWithId }
    | { kind: "empty"; goal: string }
  > = [
    ...plannedRows,
    ...visibleEmptyGoals.map((g) => ({ kind: "empty", goal: g }) as const),
  ];

  return (
    <>
      <GroupedSection
        header={t("woop.section.title")}
        footer={emptyGoals.length > 1 ? t("woop.section.footerOne") : t("woop.section.footer")}
      >
        {rows.map((row, idx) => {
          // "N개 더" 행이 뒤에 붙으면 마지막 행에도 구분선이 있어야 한다.
          const isLast = idx === rows.length - 1 && hiddenEmptyCount === 0;
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

        {/* 접어둔 미설계 목표 — 눌러야 펼쳐진다(숨기는 게 아니라 순서를 정해주는 것) */}
        {hiddenEmptyCount > 0 && (
          <button
            type="button"
            onClick={() => setShowAllEmpty(true)}
            className="w-full flex items-center gap-3 px-4 py-3 text-left"
          >
            <span className="w-9 flex-shrink-0 text-center text-[15px] text-[var(--label-3)]" aria-hidden>
              ⌄
            </span>
            <span className="flex-1 text-[15px] leading-[20px] tracking-[-0.24px] text-[var(--label-2)]">
              {t("woop.section.moreCta", { count: hiddenEmptyCount })}
            </span>
          </button>
        )}
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
