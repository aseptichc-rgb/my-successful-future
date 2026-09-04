"use client";

import { useSyncExternalStore } from "react";
import { useAuth } from "@/lib/auth-context";
import type { AckStore } from "@/lib/ackStore";
import { computeTrialStatus } from "@/lib/trialStatus";
import { computeRecommitVariant } from "@/lib/recommit";
import { isDerivedDeclaration } from "@/lib/declarationNudge";
import { pickHomeNotice, type HomeNoticeKind } from "@/lib/homeNotice";
import type { GoalSlotState } from "@/lib/goalSlots";
import type { AffirmationStreak } from "@/types";
import TrialBanner from "@/components/home/TrialBanner";
import RecommitCard, {
  isRecommitDismissed,
  recommitDismissStore,
} from "@/components/home/RecommitCard";
import DeclarationNudgeCard, {
  declarationNudgeDismissStore,
} from "@/components/home/DeclarationNudgeCard";
import SlotUnlockBanner, {
  shouldShowSlotUnlock,
  slotUnlockAckStore,
} from "@/components/home/SlotUnlockBanner";
import StepUpCard, { shouldShowStepUp, stepUpAckStore } from "@/components/home/StepUpCard";

/* ─────────────────────────────────────────────────────────────────
 * NoticeSlot — 오늘 탭 상단의 알림 자리. 자격 있는 배너 중 **한 장만** 그린다.
 *
 * 어느 것을 고를지는 lib/homeNotice(순수)가 정하고, 여기서는 각 카드의 자격을 같은
 * 순수 함수·같은 확인 스토어로 계산해 넘긴다. 카드 내부 가드는 그대로 두었다 — 판정의
 * 단일 진실은 순수 함수이고, 카드는 그 결과를 한 번 더 확인할 뿐이다(중복 평가 비용은 0에 가깝다).
 * ───────────────────────────────────────────────────────────────── */

function useAck<T>(store: AckStore<T>): T {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
}

export default function NoticeSlot({
  ymd,
  streak,
  alreadyCheckedInToday,
  onCheckinCta,
  declaration,
  goal,
  slots,
  proUnlockAll,
  stepUpDraft,
  onEditAffirmations,
  onAddGoal,
  onRefineGoal,
}: {
  ymd: string;
  streak: AffirmationStreak | undefined;
  alreadyCheckedInToday: boolean;
  /** 재약속 카드의 "지금 체크인하기" — 오늘 탭이 체크인 카드로 스크롤·포커스한다. */
  onCheckinCta: () => void;
  /** 현재 성공 선언 1줄 (successAffirmations[0]) — 파생 선언 안내 판정용. */
  declaration: string;
  /** 오늘의 목표 1줄 (goals[0]). */
  goal: string;
  slots: GoalSlotState;
  /** 결제 프로는 전 칸이 첫날부터 열려 있어 "새 칸이 열렸어요" 축하가 거짓이 된다 — 숨긴다. */
  proUnlockAll: boolean;
  /** lib/goalStepUp.suggestStepUp() 초안. null 이면 스텝업 자격 없음. */
  stepUpDraft: string | null;
  onEditAffirmations: () => void;
  onAddGoal: () => void;
  onRefineGoal: () => void;
}) {
  const { entitlement, trialEndsAt } = useAuth();
  const recommitAck = useAck(recommitDismissStore);
  const slotAck = useAck(slotUnlockAckStore);
  const stepUpAck = useAck(stepUpAckStore);
  const nudgeDismissed = useAck(declarationNudgeDismissStore);

  const recommit = computeRecommitVariant({ streak, todayYmd: ymd, alreadyCheckedInToday });
  const trial = computeTrialStatus(entitlement, trialEndsAt);

  const eligible: Record<HomeNoticeKind, boolean> = {
    recommit:
      recommit.kind === "freezeChip" ||
      (recommit.kind === "recommit" && !isRecommitDismissed(recommitAck, ymd)),
    slotUnlock: !proUnlockAll && shouldShowSlotUnlock(slots.earned, slotAck),
    stepUp: shouldShowStepUp(stepUpDraft, stepUpAck),
    declarationNudge: !nudgeDismissed && isDerivedDeclaration(declaration, goal),
    trialExpired: trial.kind === "expired",
    trial: trial.kind === "trial",
  };

  switch (pickHomeNotice(eligible)) {
    case "recommit":
      return (
        <RecommitCard
          streak={streak}
          todayYmd={ymd}
          alreadyCheckedInToday={alreadyCheckedInToday}
          onCheckinCta={onCheckinCta}
        />
      );
    case "slotUnlock":
      return (
        <SlotUnlockBanner
          earned={slots.earned}
          progress={slots.progress}
          source={slots.source}
          onAddGoal={onAddGoal}
          onRefineGoal={onRefineGoal}
        />
      );
    case "stepUp":
      return <StepUpCard draft={stepUpDraft} onApply={onRefineGoal} />;
    case "declarationNudge":
      return (
        <DeclarationNudgeCard declaration={declaration} goal={goal} onEdit={onEditAffirmations} />
      );
    case "trialExpired":
    case "trial":
      return <TrialBanner />;
    default:
      return null;
  }
}
