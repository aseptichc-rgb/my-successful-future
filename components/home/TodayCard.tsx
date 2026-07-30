"use client";

import { useT } from "@/lib/i18n";
import AffirmationCheckin, {
  type CheckinSubmitResult,
} from "@/components/affirmations/AffirmationCheckin";
import CheckinReward from "@/components/home/CheckinReward";

/* ─────────────────────────────────────────────────────────────────
 * TodayCard — 하루의 유일한 필수 행동 묶음.
 *
 *  ① 성공 선언 1줄 전사(또는 이미 했으면 보상 카드)
 *  ② 바로 아래 붙는 "오늘의 목표, 지켰나요?" 1탭
 *
 * 왜 한 묶음인가: 전사와 실행 체크가 화면 여기저기에 흩어지면 하루에 두 번 결심해야
 * 한다. 두 문장의 성격은 다르지만(선언 = 이미 이룬 상태 / 목표 = 그 사람이 되기 위한
 * 오늘의 행동) 가리키는 방향이 같으므로, 붙여 두면 "적고 → 눌렀다"로 한 번에 끝난다.
 *
 * 홈 페이지가 이 조합을 매번 조립하지 않도록 여기서 한 번만 정의한다.
 * 저장은 전부 홈이 넘겨준 핸들러가 하고(기존 saveDailyAchievedGoals 재사용),
 * 이 컴포넌트는 표시와 낙관적 상태 전환만 책임진다.
 * ───────────────────────────────────────────────────────────────── */

const ROW_COLOR = "#1E1B4B";

export default function TodayCard({
  affirmations,
  focusIndex,
  streakCount,
  alreadyCheckedIn,
  reward,
  onSubmitCheckin,
  onCheckedIn,
  goal,
  goalAchieved,
  goalSaving,
  onToggleGoal,
  onSetGoal,
}: {
  affirmations: string[];
  focusIndex: number;
  streakCount: number;
  alreadyCheckedIn: boolean;
  /** 이번 세션에서 방금 체크인했을 때만 채워진다 — 채워지면 보상 카드로 교체. */
  reward: CheckinSubmitResult | null;
  onSubmitCheckin: (entries: Array<{ index: number; text: string }>) => Promise<CheckinSubmitResult>;
  onCheckedIn?: (result: CheckinSubmitResult) => void;
  /** 오늘 확인할 목표 1줄. 없으면 목표 정하기 CTA 를 보여준다. */
  goal: string | null;
  goalAchieved: boolean;
  goalSaving: boolean;
  onToggleGoal: () => void;
  onSetGoal: () => void;
}) {
  const t = useT();
  const checkedIn = alreadyCheckedIn || reward !== null;

  return (
    <div className="space-y-2">
      {reward ? (
        <CheckinReward
          streakCount={reward.streakCount}
          depth={reward.depth}
          evidenceVotes={reward.evidenceVotes}
          evidenceTag={reward.evidenceTag}
          freezeUsed={reward.freezeUsed}
          growthVotes={reward.growthVotes}
          extraMismatchCount={reward.mismatchedIndices?.length ?? 0}
        />
      ) : (
        affirmations.length > 0 && (
          <AffirmationCheckin
            affirmations={affirmations}
            focusIndex={focusIndex}
            streakCount={streakCount}
            alreadyCheckedIn={alreadyCheckedIn}
            onSubmit={onSubmitCheckin}
            onCheckedIn={onCheckedIn}
          />
        )
      )}

      <div className="bg-[var(--bg-grouped-2)] rounded-[12px] overflow-hidden">
        <div className="flex items-center justify-between gap-2 px-5 pt-4 pb-1">
          <span className="text-[17px] font-semibold tracking-[-0.43px] text-[var(--label)]">
            {t("home.todayGoal.title")}
          </span>
          {goalAchieved && (
            <span className="text-[13px] font-medium text-[#D85A30]">
              {t("home.todayGoal.doneToday")}
            </span>
          )}
        </div>

        {goal ? (
          <>
            <p className="px-5 pb-3 text-[17px] leading-[23px] tracking-[-0.43px] font-medium text-[var(--label)]">
              {goal}
            </p>

            <div className="border-t border-[var(--sep)] px-5 py-3">
              <p className="text-[13px] leading-[18px] tracking-[-0.08px] text-[var(--label-2)]">
                {checkedIn && !goalAchieved
                  ? t("home.todayGoal.afterCheckin")
                  : t("home.todayGoal.question")}
              </p>
              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={onToggleGoal}
                  disabled={goalSaving}
                  aria-pressed={goalAchieved}
                  className="flex items-center gap-2 rounded-full px-4 py-2 text-[15px] font-semibold transition-opacity disabled:opacity-40"
                  style={{
                    background: goalAchieved ? ROW_COLOR : ROW_COLOR + "14",
                    color: goalAchieved ? "#FFFFFF" : ROW_COLOR,
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M5 12l5 5L20 7" />
                  </svg>
                  {goalAchieved ? t("home.todayGoal.doneToday") : t("home.todayGoal.did")}
                </button>
                <span className="text-[13px] text-[var(--label-3)]">
                  {goalAchieved ? t("home.todayGoal.undo") : t("home.todayGoal.notYet")}
                </span>
              </div>
            </div>
          </>
        ) : (
          <button
            type="button"
            onClick={onSetGoal}
            className="w-full px-5 pb-4 text-left"
          >
            <span className="block text-[15px] leading-[20px] tracking-[-0.24px] text-[var(--label-2)]">
              {t("home.todayGoal.empty")}
            </span>
            <span className="mt-1 block text-[15px] font-medium text-[var(--soul)]">
              {t("home.todayGoal.setCta")} ›
            </span>
          </button>
        )}
      </div>
    </div>
  );
}
