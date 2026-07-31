"use client";

import { useT } from "@/lib/i18n";
import type { PlanUnlockState } from "@/lib/planUnlock";
import type { ExecutionPlan } from "@/types";

/* ─────────────────────────────────────────────────────────────────
 * DailyPlanCard — "오늘의 if-then" (아침 모드의 실행 앵커).
 *
 *  · full   : 아침 모드 — if/then 두 줄 + 연결 목표 캡션 + "어젯밤의 내가 정한
 *             첫 행동"(있을 때). 하루의 첫 화면에서 결정 순간의 행동 큐를 준다.
 *  · compact: 중립/저녁 모드 — 한 줄 축약(카드 존재감만 유지).
 *  · 플랜이 없으면 CTA 행 — 탭하면 홈 위로 설계 시트가 바로 열린다.
 *  · locked : 잠금 예고 행(탭 불가) — 실행 설계는 꾸준함으로 벌어서 연다.
 *  · hidden : 첫 행동 회수 행만(그마저 없으면 null — 래퍼가 통째로 생략).
 * ───────────────────────────────────────────────────────────────── */

export default function DailyPlanCard({
  plan,
  yesterdayFirstAction,
  compact,
  unlock,
  onCreateCta,
}: {
  plan: Pick<ExecutionPlan, "goal" | "ifText" | "thenText"> | null;
  /** 어제 저녁에 적은 "내일 첫 행동" — 아침(full)에서만 의미 있으므로 compact 면 무시. */
  yesterdayFirstAction: string | null;
  compact: boolean;
  /** 해금 상태 (lib/planUnlock) — 잠금/숨김 분기는 플랜 유무보다 먼저 본다. */
  unlock: PlanUnlockState;
  onCreateCta: () => void;
}) {
  const t = useT();

  if (unlock.kind === "hidden") {
    // 설계할 목표가 없다 — 첫 행동 회수 행만 남기고, 그마저 없으면 카드 자체를 접는다.
    if (!compact && yesterdayFirstAction) {
      return (
        <div className="bg-[var(--bg-grouped-2)] rounded-[12px] overflow-hidden">
          <FirstActionRow text={yesterdayFirstAction} />
        </div>
      );
    }
    return null;
  }

  if (unlock.kind === "locked") {
    // 아직 잠김 — 조건·진행도만 예고한다. 눌러도 아무 일이 없는 행은 button 이 아니다.
    return (
      <div className="bg-[var(--bg-grouped-2)] rounded-[12px] overflow-hidden">
        {!compact && yesterdayFirstAction && (
          <FirstActionRow text={yesterdayFirstAction} withSeparator />
        )}
        <div className="flex items-center gap-3 px-5 py-4">
          <span className="text-[17px]" aria-hidden>
            🔒
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-[15px] font-medium text-[var(--label-2)]">
              {t("plan.locked.title")}
            </span>
            <span className="block mt-0.5 text-[13px] leading-[18px] tracking-[-0.08px] text-[var(--label-3)]">
              {t("plan.locked.body", { days: unlock.threshold, progress: unlock.progress })}
            </span>
          </span>
        </div>
      </div>
    );
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
          className="w-full flex items-center gap-3 px-5 py-4 text-left"
        >
          <span className="text-[17px]" aria-hidden>
            ⚡
          </span>
          <span className="flex-1 text-[15px] font-medium text-[var(--soul)]">
            {t("plan.today.emptyCta")}
          </span>
          <svg width="8" height="14" viewBox="0 0 8 14" fill="none" aria-hidden>
            <path d="M1 1l6 6-6 6" stroke="rgba(60,60,67,0.3)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
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
      </div>
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
