"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { updateUserGoals } from "@/lib/firebase";
import { missingGoalSignals, needsMoreSpecificGoal, type GoalSignal } from "@/lib/goalQuality";
import { GOAL_SLOT_MAX, GOAL_TEXT_MAX } from "@/lib/constants/goal";
import type { GoalSlotState } from "@/lib/goalSlots";
import { notifyAndroidWidgetRefresh } from "@/lib/widgetBridge";
import { refreshIosWidget } from "@/lib/iosWidget";
import { useT, type DictKey } from "@/lib/i18n";
import Sheet from "@/components/ui/Sheet";
import type { User } from "@/types";

/* ─────────────────────────────────────────────────────────────────
 * GoalsSheet — "꿈에 다가가는 오늘의 행동" 목표 편집.
 *
 * 설정 페이지에서 내 꿈 탭으로 옮겨 왔다. 목표 칸 수는 꾸준함으로 열린다(lib/goalSlots —
 * 호출부가 계산해 넘긴다). 목표는 성공 선언과 독립이다 — 저장 후 "다짐도 바꿀까요?" 를
 * 묻지 않는다(선언 = 이미 이룬 상태 / 목표 = 오늘의 행동).
 * ───────────────────────────────────────────────────────────────── */

/** 구체성 신호 → i18n 라벨/예시 키. 빠진 신호만 칩으로 보여준다. */
const GOAL_SIGNAL_LABEL_KEY: Record<GoalSignal, DictKey> = {
  count: "goal.specific.count",
  cadence: "goal.specific.cadence",
  unit: "goal.specific.unit",
};
const GOAL_SIGNAL_EXAMPLE_KEY: Record<GoalSignal, DictKey> = {
  count: "goal.specific.countExample",
  cadence: "goal.specific.cadenceExample",
  unit: "goal.specific.unitExample",
};

export default function GoalsSheet({
  uid,
  user,
  goalSlots,
  refineIdx = null,
  onClose,
}: {
  uid: string;
  user: User;
  goalSlots: GoalSlotState;
  /** 홈의 해금 배너에서 "더 구체적으로"로 들어온 경우 — 해당 줄의 구체성 힌트를 항상 펼치고 포커스. */
  refineIdx?: number | null;
  onClose: () => void;
}) {
  const t = useT();
  const { refreshUser } = useAuth();
  const [goals, setGoals] = useState<string[]>(() =>
    user.goals && user.goals.length > 0 ? [...user.goals] : [],
  );
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    notifyAndroidWidgetRefresh();
    setSaving(true);
    try {
      const cleaned = goals.map((g) => g.trim()).filter((g) => g.length > 0);
      await updateUserGoals(uid, cleaned);
      await refreshUser().catch(() => {});
      void refreshIosWidget();
      onClose();
    } catch (err) {
      console.error("[dream] 목표 저장 실패:", err);
      window.alert(t("common.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet onClose={onClose} title={t("home.goals.title")}>
      <div className="mt-2 overflow-hidden rounded-[12px] bg-[var(--bg-grouped-2)]">
        {goals.map((g, i) => {
          const isLast = i === goals.length - 1;
          // 구체성 힌트는 조용히 — 점수가 낮을 때, 또는 홈 배너로 들어온 그 줄에만.
          const missing = missingGoalSignals(g);
          const showHint = missing.length > 0 && (refineIdx === i || needsMoreSpecificGoal(g));
          return (
            <div key={i} className="relative px-4 py-1">
              <div className="flex min-h-[52px] items-center gap-3">
                <span className="w-7 text-center text-[15px] font-bold text-[#1E1B4B]">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <input
                  value={g}
                  maxLength={GOAL_TEXT_MAX}
                  autoFocus={refineIdx === i}
                  onChange={(e) => setGoals(goals.map((x, j) => (j === i ? e.target.value : x)))}
                  className="flex-1 bg-transparent py-2 text-[17px] tracking-[-0.43px] text-[var(--label)] focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setGoals(goals.filter((_, j) => j !== i))}
                  aria-label={t("home.goals.deleteAria")}
                  className="text-[15px] text-[#FF3B30]"
                >
                  ×
                </button>
              </div>

              {showHint && (
                <div className="pb-2.5 pl-10">
                  <p className="text-[12px] leading-[16px] tracking-[-0.05px] text-[var(--label-3)]">
                    {t("goal.specific.hint")}
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {missing.map((signal) => (
                      <span
                        key={signal}
                        className="inline-flex items-center gap-1 rounded-full bg-[#1E1B4B]/[0.06] px-2.5 py-1 text-[12px] tracking-[-0.05px] text-[#1E1B4B]/80"
                      >
                        {t(GOAL_SIGNAL_LABEL_KEY[signal])}
                        <span className="text-[var(--label-3)]">
                          {t(GOAL_SIGNAL_EXAMPLE_KEY[signal])}
                        </span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {!isLast && (
                <div className="absolute bottom-0 left-[50px] right-0 h-[0.5px] bg-[var(--sep)]" />
              )}
            </div>
          );
        })}

        {/* 잠긴 칸 — 왜 못 늘리는지, 언제 열리는지를 그 자리에서 보여준다. */}
        {goals.length >= goalSlots.unlocked &&
          goalSlots.unlocked < GOAL_SLOT_MAX &&
          goalSlots.nextThreshold !== null && (
            <div className="flex items-center gap-3 border-t border-[var(--sep)] px-4 py-3">
              <span className="w-7 text-center text-[15px]" aria-hidden>
                🔒
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[15px] leading-[20px] tracking-[-0.24px] text-[var(--label-2)]">
                  {t("goalSlot.locked", { days: goalSlots.nextThreshold })}
                </p>
                <p className="mt-0.5 text-[13px] tracking-[-0.08px] text-[var(--label-3)]">
                  {t("goalSlot.lockedProgress", { progress: goalSlots.progress })}
                </p>
              </div>
            </div>
          )}

        {goals.length < goalSlots.unlocked && (
          <button
            type="button"
            onClick={() => setGoals([...goals, ""])}
            className="block w-full px-4 py-3 text-left text-[17px] text-[#D85A30]"
          >
            ＋ {t("common.add")}
          </button>
        )}
      </div>

      <p className="mt-2 px-1 text-[13px] leading-[18px] tracking-[-0.08px] text-[var(--label-2)]">
        {/* nextThreshold === null == 더 벌어서 열 칸이 없다(전부 해금 또는 결제 프로) —
            그때 "쌓이면 열려요" 안내는 거짓이 되므로 최대치 안내로 바꾼다. */}
        {goalSlots.nextThreshold === null
          ? t("goalSlot.maxed", { max: GOAL_SLOT_MAX })
          : t("goalSlot.hint")}
      </p>

      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="text-[17px] font-semibold text-[var(--soul)] disabled:opacity-40"
        >
          {saving ? t("common.saving") : t("common.save")}
        </button>
      </div>
    </Sheet>
  );
}
