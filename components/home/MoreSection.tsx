"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n";
import type { HomeMode } from "@/lib/homeMode";
import type { PlanUnlockState } from "@/lib/planUnlock";
import type { ExecutionPlan } from "@/types";
import DisclosureSection from "@/components/ui/DisclosureSection";
import FutureSelfLine from "@/components/home/FutureSelfLine";
import DailyPlanCard from "@/components/home/DailyPlanCard";
import ExtraGoalRows from "@/components/home/ExtraGoalRows";
import LockedTeaserRow from "@/components/home/LockedTeaserRow";
import ExecutionPlanSheet from "@/components/woop/ExecutionPlanSheet";

/* ─────────────────────────────────────────────────────────────────
 * MoreSection — 홈의 "더 보기" (기본 접힘).
 *
 * 안에 든 것: 미래의 나 · 오늘의 if-then / 추가 목표 · 목표 관리 · 잠금 예고.
 * 오늘의 기록(잘한 일 · 내일 첫 행동 · 주간 회고)은 기록 탭(app/(tabs)/record)으로 갔다.
 * ───────────────────────────────────────────────────────────────── */

const IconChevron = ({ color = "rgba(60,60,67,0.3)" }: { color?: string }) => (
  <svg width="8" height="14" viewBox="0 0 8 14" fill="none" aria-hidden>
    <path d="M1 1l6 6-6 6" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export default function MoreSection({
  uid,
  homeMode,
  futureText,
  todayPlan,
  activePlanCount,
  yesterdayFirstAction,
  goals,
  identityLabels,
  unlock,
  achievedGoals,
  onToggleGoalAchieved,
  onOpenSettings,
}: {
  uid: string;
  homeMode: HomeMode;
  futureText: string;
  todayPlan: Pick<ExecutionPlan, "goal" | "ifText" | "thenText"> | null;
  /** 활성 플랜 개수 — 카드가 "매일 하나씩 돌아간다"는 안내를 켤지 판단한다. */
  activePlanCount: number;
  yesterdayFirstAction: string | null;
  /** 전체 목표 (User.goals) — 첫 목표는 오늘 카드 몫이라 여기선 나머지만 그린다. */
  goals: string[];
  /** 설계 시트의 정체성 칩 풀 (User.identities.labels — 없으면 시트가 섹션 숨김). */
  identityLabels: string[];
  /** 실행 설계 해금 상태. null = 플랜 첫 스냅샷 전 — 영역을 그리지 않는다(깜빡임 방지). */
  unlock: PlanUnlockState | null;
  achievedGoals: string[];
  onToggleGoalAchieved: (goal: string) => void;
  onOpenSettings: () => void;
}) {
  const t = useT();
  const [planSheetOpen, setPlanSheetOpen] = useState(false);

  /* ── 잠긴 기능 예고: 이름 없이 ──
   * 실행 설계가 잠겨 있으면 정체를 감춘 채 조건과 진행도만 보여준다 — 궁금함이 남아야 다시 온다. */
  const nearestLock = unlock?.kind === "locked" ? unlock : null;

  return (
    <>
    <DisclosureSection
      id="home.more"
      header={t("home.section.more")}
      // 접힌 요약도 잠긴 기능의 이름을 흘리지 않는다(펼침/접힘 어느 쪽도 예고는 한 벌).
      summary={t(nearestLock ? "home.more.summaryLocked" : "home.more.summary")}
    >
      {/* 미래의 나 — 한 줄, 탭하면 펼침. 수정은 설정에서. */}
      <div className="border-b border-[var(--sep)]">
        <FutureSelfLine text={futureText} onWrite={onOpenSettings} />
      </div>

      {/* 오늘의 if-then — 아침엔 전체, 그 외엔 한 줄 축약. 잠김/로딩 전엔 래퍼(구분선)째 생략.
          잠긴 동안 남는 건 "어젯밤의 첫 행동" 뿐이다(기능 이름은 아래 잠금 행에서도 감춘다). */}
      {(() => {
        if (!unlock) return null;
        const firstAction = homeMode === "morning" ? yesterdayFirstAction : null;
        if (unlock.kind !== "open" && !firstAction) return null;
        return (
          <div className="border-b border-[var(--sep)]">
            <DailyPlanCard
              plan={todayPlan}
              activePlanCount={activePlanCount}
              yesterdayFirstAction={firstAction}
              compact={homeMode !== "morning"}
              unlock={unlock}
              onCreateCta={() => setPlanSheetOpen(true)}
            />
          </div>
        );
      })()}

      {/* 추가로 해금한 목표 — 배지를 탭해 달성 토글(추가/삭제는 설정). */}
      <ExtraGoalRows goals={goals} achievedGoals={achievedGoals} onToggle={onToggleGoalAchieved} />

      {/* 목표 관리 — 홈 첫 화면에 자유입력이 깔리지 않는다. 편집은 시트/설정에서.
          잠긴 동안엔 문구에서 실행 설계 이름을 뺀다(예고는 잠금 행 한 곳으로 충분). */}
      <button
        type="button"
        onClick={onOpenSettings}
        className="w-full flex items-center gap-3 px-4 py-3 text-left border-b border-[var(--sep)]"
      >
        <span className="w-9 flex-shrink-0 text-center text-[15px]" aria-hidden>
          ⚡
        </span>
        <span className="flex-1 text-[15px] leading-[20px] font-medium text-[var(--soul)]">
          {t(unlock?.kind === "open" ? "home.plans.manage" : "home.plans.manageLocked")}
        </span>
        <IconChevron />
      </button>

      {nearestLock && (
        <LockedTeaserRow progress={nearestLock.progress} threshold={nearestLock.threshold} />
      )}
    </DisclosureSection>

    {/* 설계 시트 — DisclosureSection 바깥에 마운트해 섹션을 접어도 시트가 살아 있다.
        기본은 빠른 설계(quick, 키보드 0회) — 자유입력은 "직접 다듬기" 두 단계 뒤. */}
    {planSheetOpen && (
      <ExecutionPlanSheet
        uid={uid}
        goals={goals}
        identityLabels={identityLabels}
        onClose={() => setPlanSheetOpen(false)}
      />
    )}
    </>
  );
}
