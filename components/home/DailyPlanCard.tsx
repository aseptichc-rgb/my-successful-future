"use client";

import { useT } from "@/lib/i18n";
import type { PlanUnlockState } from "@/lib/planUnlock";
import type { ExecutionPlan } from "@/types";
import WhyIfThen from "@/components/woop/WhyIfThen";

/* ─────────────────────────────────────────────────────────────────
 * DailyPlanCard — "오늘의 if-then" (아침 모드의 실행 앵커).
 *
 *  · full   : 아침 모드 — if/then 두 줄 + 연결 목표 캡션 + "이게 뭔지" 한 줄 설명 +
 *             접힌 "왜 미리 정해두나요?" + "어젯밤의 내가 정한 첫 행동"(있을 때).
 *             하루의 첫 화면에서 결정 순간의 행동 큐를 준다.
 *  · compact: 중립/저녁 모드 — 한 줄 축약(카드 존재감만 유지).
 *  · 플랜이 없으면 CTA 행 — 탭하면 홈 위로 설계 시트가 바로 열린다.
 *  · locked / hidden : 첫 행동 회수 행만(그마저 없으면 null — 래퍼가 통째로 생략).
 *    잠긴 동안 이 카드는 자기 이름조차 내지 않는다 — 예고는 더 보기 맨 아래의
 *    익명 잠금 행(MoreSection 의 LockedTeaserRow) 한 곳이 전담한다.
 *
 * 설명은 "무엇 → 왜"의 2단이다: 카드에 상시로 있는 건 한 줄(plan.today.desc)뿐이고,
 * 근거·연구는 접힌 WhyIfThen 안에 둔다. 아침 카드의 본래 일은 오늘 할 행동을
 * 보여주는 것이라 설명이 행동보다 길어지면 안 된다.
 * ───────────────────────────────────────────────────────────────── */

export default function DailyPlanCard({
  plan,
  activePlanCount,
  yesterdayFirstAction,
  compact,
  unlock,
  onCreateCta,
}: {
  plan: Pick<ExecutionPlan, "goal" | "ifText" | "thenText"> | null;
  /**
   * 활성 플랜 개수 — 2개 이상이면 "매일 하나씩 돌아가며 보여준다"고 알린다
   * (lib/planRotation 의 ymd 시드 회전). 어제와 다른 플랜이 뜬 걸 버그로 읽지 않게.
   */
  activePlanCount: number;
  /** 어제 저녁에 적은 "내일 첫 행동" — 아침(full)에서만 의미 있으므로 compact 면 무시. */
  yesterdayFirstAction: string | null;
  compact: boolean;
  /** 해금 상태 (lib/planUnlock) — 잠금/숨김 분기는 플랜 유무보다 먼저 본다. */
  unlock: PlanUnlockState;
  onCreateCta: () => void;
}) {
  const t = useT();

  if (unlock.kind !== "open") {
    /* 설계할 목표가 없거나(hidden) 아직 잠김(locked) — 두 경우 모두 카드는 자신을
       드러내지 않는다. 이름과 설명을 미리 깔면 "지금은 못 쓰는 기능"의 목록이 되고,
       그건 기대가 아니라 결핍으로 읽힌다. 첫 행동 회수 행만 남기고 나머지는 접는다. */
    if (!compact && yesterdayFirstAction) {
      return (
        <div className="bg-[var(--bg-grouped-2)] rounded-[12px] overflow-hidden">
          <FirstActionRow text={yesterdayFirstAction} />
        </div>
      );
    }
    return null;
  }

  if (!plan) {
    // 플랜 없음 — 가벼운 CTA 행 (첫 행동만 있으면 그것만이라도 보여준다).
    return (
      <div className="bg-[var(--bg-grouped-2)] rounded-[12px] overflow-hidden">
        {!compact && yesterdayFirstAction && (
          <FirstActionRow text={yesterdayFirstAction} withSeparator />
        )}
        <button
          type="button"
          onClick={onCreateCta}
          className="w-full flex items-start gap-3 px-5 py-4 text-left"
        >
          <span className="text-[17px] leading-[20px]" aria-hidden>
            ⚡
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-[15px] leading-[20px] font-medium text-[var(--soul)]">
              {t("plan.today.emptyCta")}
            </span>
            {/* CTA 이름만으로는 무엇을 만드는 건지 모른다 — 무엇/얼마나 걸리는지 한 줄. */}
            <span className="block mt-0.5 text-[13px] leading-[18px] tracking-[-0.08px] text-[var(--label-2)]">
              {t("plan.today.emptyDesc")}
            </span>
          </span>
          <svg width="8" height="14" viewBox="0 0 8 14" fill="none" aria-hidden className="mt-[4px] flex-shrink-0">
            <path d="M1 1l6 6-6 6" stroke="rgba(60,60,67,0.3)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        {/* 아직 플랜이 없을 때야말로 "왜 하는지"가 필요하다 — 아침에만(compact 는 한 줄 유지). */}
        {!compact && <WhyIfThen variant="inline" />}
      </div>
    );
  }

  if (compact) {
    return (
      <div className="bg-[var(--bg-grouped-2)] rounded-[12px] px-5 py-3">
        <p className="text-[13px] leading-[18px] tracking-[-0.08px] text-[var(--label-2)] truncate">
          <span className="font-semibold text-[var(--soul)]">{t("plan.today.title")}</span>
          {" · "}
          {t("plan.today.if")} {plan.ifText} → {plan.thenText}
        </p>
      </div>
    );
  }

  return (
    <div className="bg-[var(--bg-grouped-2)] rounded-[12px] overflow-hidden">
      <div className="flex items-center justify-between px-5 pt-4 pb-2">
        <span className="text-[17px] font-semibold tracking-[-0.43px] text-[var(--label)]">
          {t("plan.today.title")}
        </span>
        <span className="text-[12px] tracking-[-0.08px] text-[var(--label-3)] truncate max-w-[45%]">
          {plan.goal}
        </span>
      </div>
      <div className="px-5 pb-4 space-y-2">
        <div className="flex items-start gap-2.5">
          <span
            className="flex-shrink-0 mt-[1px] rounded-[6px] px-2 py-0.5 text-[12px] font-bold tracking-[0.2px]"
            style={{ background: "rgba(30,27,75,0.08)", color: "#1E1B4B" }}
          >
            {t("plan.today.if")}
          </span>
          <p className="flex-1 text-[16px] leading-[22px] tracking-[-0.3px] text-[var(--label)]">
            {plan.ifText}
          </p>
        </div>
        <div className="flex items-start gap-2.5">
          <span
            className="flex-shrink-0 mt-[1px] rounded-[6px] px-2 py-0.5 text-[12px] font-bold tracking-[0.2px]"
            style={{ background: "rgba(216,90,48,0.12)", color: "#D85A30" }}
          >
            {t("plan.today.then")}
          </span>
          <p className="flex-1 text-[16px] leading-[22px] tracking-[-0.3px] font-medium text-[var(--label)]">
            {plan.thenText}
          </p>
        </div>

        {/* 이 두 줄이 무엇인지 — 카드에 상시 남는 유일한 설명. 자세한 근거는 아래 접힘 안. */}
        <p className="pt-1 text-[12px] leading-[17px] tracking-[-0.08px] text-[var(--label-3)]">
          {t("plan.today.desc")}
        </p>
        {/* 플랜이 2개 이상일 때만 — 하나뿐이면 회전이 없어 오히려 헷갈린다. */}
        {activePlanCount >= 2 && (
          <p className="text-[12px] leading-[17px] tracking-[-0.08px] text-[var(--label-3)]">
            {t("plan.today.rotation", { count: activePlanCount })}
          </p>
        )}
      </div>
      <WhyIfThen variant="inline" />
      {yesterdayFirstAction && <FirstActionRow text={yesterdayFirstAction} withSeparator />}
    </div>
  );
}

/** "어젯밤의 내가 정한 첫 행동" 보조 행 — 미완료 계획의 인지 침입을 아침 실행으로 회수. */
function FirstActionRow({ text, withSeparator }: { text: string; withSeparator?: boolean }) {
  const t = useT();
  return (
    <div
      className="px-5 py-3"
      style={withSeparator ? { borderTop: "0.5px solid var(--sep)" } : undefined}
    >
      <p className="text-[12px] tracking-[-0.08px] text-[var(--label-3)]">
        {t("plan.today.firstAction")}
      </p>
      <p className="mt-0.5 text-[15px] leading-[20px] tracking-[-0.24px] text-[var(--label)]">
        {text}
      </p>
    </div>
  );
}
