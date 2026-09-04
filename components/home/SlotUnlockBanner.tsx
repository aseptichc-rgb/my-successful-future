"use client";

import { useSyncExternalStore } from "react";
import { GOAL_SLOT_MAX } from "@/lib/constants/goal";
import { createAckStore } from "@/lib/ackStore";
import type { GoalSlotSource } from "@/lib/goalSlots";
import { useT } from "@/lib/i18n";

/* ─────────────────────────────────────────────────────────────────
 * SlotUnlockBanner — 목표 칸이 하나 열린 그 순간에만 뜨는 1회성 배너.
 *
 * 이 앱의 복잡도는 사용자가 꾸준함으로 벌어서 연다(lib/goalSlots). 칸이 열렸다는
 * 사실을 조용히 넘기면 아무도 모르고, 상시 노출하면 그냥 잔소리가 된다 —
 * 그래서 "열린 순간 한 번"만 보여주고, 선택지는 딱 두 개로 좁힌다.
 *
 *   [지금 목표를 더 구체적으로]  vs  [새 목표 추가]
 *
 * 목표를 늘리는 것만이 성장은 아니다. 하나를 더 또렷하게 만드는 쪽이 대개 낫기 때문에
 * 같은 무게로 나란히 제시한다.
 *
 * 확인 여부는 "확인한 최고 earned 값"으로 남긴다(lib/ackStore, 서버 필드 불필요).
 * SSR 스냅샷은 GOAL_SLOT_MAX — earned 가 그를 넘지 않으므로 서버 렌더에서는 항상
 * 숨겨졌다가, 하이드레이션 후에만 실제 값으로 판정된다(깜빡임/경고 회피).
 * ───────────────────────────────────────────────────────────────── */

/** "확인한 최고 earned 값" — 알림 슬롯(components/home/NoticeSlot)이 자격 판정에 같은 값을 읽는다. */
export const slotUnlockAckStore = createAckStore<number>("anima.goalSlot.ack", {
  parse: (raw) => {
    const n = raw === null ? 0 : Number(raw);
    return Number.isFinite(n) && n > 0 ? n : 0;
  },
  serialize: String,
  serverSnapshot: GOAL_SLOT_MAX,
});

/** 첫 칸(earned=1)은 해금이 아니라 기본값이므로 축하할 것이 없다 — 이미 확인한 값 이하도 마찬가지. */
export function shouldShowSlotUnlock(earned: number, ack: number): boolean {
  return earned > 1 && earned > ack;
}

export default function SlotUnlockBanner({
  earned,
  progress,
  source,
  onAddGoal,
  onRefineGoal,
}: {
  /** 꾸준함으로 연 칸 수 (computeGoalSlots().earned). */
  earned: number;
  /** 현재 최고 연속일 — 문구에 그대로 쓴다. */
  progress: number;
  /** 게이지를 끌고 있는 축 — 달성 축이면 "목표를 지켰어요" 문구로 바꾼다. */
  source: GoalSlotSource;
  onAddGoal: () => void;
  onRefineGoal: () => void;
}) {
  const t = useT();
  const ack = useSyncExternalStore(
    slotUnlockAckStore.subscribe,
    slotUnlockAckStore.getSnapshot,
    slotUnlockAckStore.getServerSnapshot,
  );

  if (!shouldShowSlotUnlock(earned, ack)) return null;

  const dismiss = () => slotUnlockAckStore.acknowledge(earned);

  return (
    <div className="mx-4 mt-4 rounded-[12px] bg-[var(--bg-grouped-2)] px-5 py-4">
      <p className="text-[17px] font-semibold tracking-[-0.43px] text-[var(--label)]">
        {t("goalSlot.unlock.title")}
      </p>
      <p className="mt-1.5 text-[13px] leading-[18px] tracking-[-0.08px] text-[var(--label-2)]">
        {t(source === "goal" ? "goalSlot.unlock.bodyGoal" : "goalSlot.unlock.body", {
          days: progress,
        })}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            dismiss();
            onRefineGoal();
          }}
          className="rounded-full bg-[#1E1B4B] px-4 py-2 text-[15px] font-semibold text-white"
        >
          {t("goalSlot.unlock.refine")}
        </button>
        <button
          type="button"
          onClick={() => {
            dismiss();
            onAddGoal();
          }}
          className="rounded-full bg-[#1E1B4B]/[0.08] px-4 py-2 text-[15px] font-semibold text-[#1E1B4B]"
        >
          {t("goalSlot.unlock.addGoal")}
        </button>
        <button
          type="button"
          onClick={dismiss}
          className="ml-auto text-[15px] font-medium text-[var(--label-3)]"
        >
          {t("goalSlot.unlock.later")}
        </button>
      </div>
    </div>
  );
}
