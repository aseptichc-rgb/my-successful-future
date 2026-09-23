"use client";

import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n";
import { PRO_SECTION_PATH } from "@/lib/constants/storeLinks";

/* ─────────────────────────────────────────────────────────────────
 * ExtraGoalRows — 첫 목표 뒤의 추가 목표(해금분) 체크 행.
 *
 * 첫 목표는 오늘 카드(TodayCard)가 보여주므로 여기서는 나머지만 그린다 — 번호는 02부터.
 * 배지를 탭하면 달성 토글(추가/삭제는 내 꿈 탭). 목표가 1개 이하면 아무것도 그리지 않는다.
 * 행만 그린다 — 인셋 카드 래퍼는 호출부 몫(오늘 탭은 자체 카드, 더 보기 안에서는 섹션 카드).
 *
 * 잠긴 행: 인덱스가 `unlocked` 이상인 목표(체험 때 만들었다가 만료로 상한 밖이 된 것)는
 * 🔒 배지로 그리고 탭하면 설정의 ANIMA PRO 로 보낸다. 데이터는 그대로 — 회수가 아니라 잠금이다
 * (lib/goalSlots lockedCount 의 화면 표현).
 * ───────────────────────────────────────────────────────────────── */

// 슬롯 배지는 모두 동일 indigo — 차분한 인상.
const SLOT_COLOR = "#1E1B4B";
/** 오늘 카드가 첫 목표를 맡으므로 추가 목표 번호는 2번부터 이어진다. */
const FIRST_EXTRA_NUMBER = 2;

export default function ExtraGoalRows({
  goals,
  achievedGoals,
  onToggle,
  unlocked,
}: {
  /** 전체 목표 (User.goals) — 첫 목표는 오늘 카드 몫이라 여기선 나머지만 그린다. */
  goals: string[];
  achievedGoals: string[];
  onToggle: (goal: string) => void;
  /** 지금 쓸 수 있는 목표 칸 수(computeGoalSlots().unlocked). 그 이상 인덱스는 잠긴다. */
  unlocked: number;
}) {
  const t = useT();
  const router = useRouter();
  const extraGoals = goals.slice(1);
  if (extraGoals.length === 0) return null;

  return (
    <>
      {extraGoals.map((goal, idx) => {
        const trimmed = goal.trim();
        const goalIndex = idx + 1; // goals 배열 기준 인덱스
        const locked = goalIndex >= unlocked;
        const achieved = !locked && trimmed.length > 0 && achievedGoals.includes(trimmed);
        const num = String(idx + FIRST_EXTRA_NUMBER).padStart(2, "0");
        const isLast = idx === extraGoals.length - 1;
        return (
          <div key={`${idx}-${goal}`} className="relative flex items-center gap-3 px-4 min-h-[60px]">
            {locked ? (
              <button
                type="button"
                onClick={() => router.push(PRO_SECTION_PATH)}
                aria-label={t("home.goals.lockedAria")}
                className="w-9 h-9 rounded-[10px] flex items-center justify-center flex-shrink-0"
                style={{ background: SLOT_COLOR + "0D" }}
              >
                <span className="text-[15px]" aria-hidden>
                  🔒
                </span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onToggle(goal)}
                aria-label={
                  achieved
                    ? t("home.goals.toggleUnachievedAria")
                    : t("home.goals.toggleAchievedAria")
                }
                aria-pressed={achieved}
                disabled={trimmed.length === 0}
                className="w-9 h-9 rounded-[10px] flex items-center justify-center flex-shrink-0 transition-opacity"
                style={{
                  background: achieved ? SLOT_COLOR : SLOT_COLOR + "1A",
                  opacity: trimmed.length === 0 ? 0.4 : 1,
                }}
              >
                {achieved ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12l5 5L20 7" />
                  </svg>
                ) : (
                  <span className="text-[15px] font-bold tracking-[-0.3px]" style={{ color: SLOT_COLOR }}>
                    {num}
                  </span>
                )}
              </button>
            )}
            <div className="flex-1 min-w-0 py-2">
              <div
                className={`text-[17px] leading-[22px] tracking-[-0.43px] ${
                  achieved
                    ? "text-[var(--label-2)] line-through decoration-[var(--label-3)]"
                    : locked
                      ? "text-[var(--label-3)]"
                      : "text-[var(--label)]"
                }`}
              >
                {trimmed || (
                  <span className="text-[var(--label-3)]">{t("home.goals.placeholder")}</span>
                )}
              </div>
              {locked && (
                <p className="mt-0.5 text-[12px] leading-[16px] tracking-[-0.05px] text-[var(--label-3)]">
                  {t("goalSlot.proLocked")}
                </p>
              )}
            </div>
            {!isLast && (
              <div
                className="absolute bottom-0 right-0 h-[0.5px]"
                style={{ left: 60, background: "var(--sep)" }}
              />
            )}
          </div>
        );
      })}
    </>
  );
}
