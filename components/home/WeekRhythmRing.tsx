"use client";

import { useT } from "@/lib/i18n";
import { addKstDays } from "@/lib/kstDate";

/* ─────────────────────────────────────────────────────────────────
 * WeekRhythmRing — 지난 7일 체크인 리듬.
 *
 * 무한 카운터(⚡17)를 근접 목표로 바꾼다: 끝이 안 보이는 수치는 목표 구배
 * (goal-gradient) 효과를 못 받는다. "이번 주 5/7" 처럼 손에 닿는 분모가 있어야
 * 마지막 한 칸을 채우려는 힘이 생긴다. 상단 스트릭 칩(→ /progress)은 그대로 둔다.
 *
 * 사전 적립(endowed progress): 창 안에 여정을 시작한 날이 있으면 그 칸을 옅게 채운다.
 * 가짜 진척이 아니라 실제 행동(온보딩 완료)을 표시하는 것이므로 정직하다.
 *
 * 데이터는 홈이 기존 getAffirmationLogYmds 로 받아 내려준다(신규 쿼리 없음).
 * ───────────────────────────────────────────────────────────────── */

/** 링 칸 수 — lib/weeklyReview 의 WEEKLY_REVIEW_DAYS 와 같은 창을 본다. */
const RING_DAYS = 7;
const SOUL = "#D85A30";

export default function WeekRhythmRing({
  todayYmd,
  checkedYmds,
  startedYmd,
}: {
  todayYmd: string;
  /** 최근 7일 중 체크인한 날짜 집합. */
  checkedYmds: Set<string>;
  /** 여정을 시작한 날(onboardedAt) 의 KST ymd — 창 안에 있으면 시작 칸으로 표시. */
  startedYmd?: string | null;
}) {
  const t = useT();

  const cells = Array.from({ length: RING_DAYS }, (_, i) =>
    addKstDays(todayYmd, -(RING_DAYS - 1 - i)),
  );
  const done = cells.filter((ymd) => checkedYmds.has(ymd)).length;
  const showStart = Boolean(startedYmd && cells.includes(startedYmd) && !checkedYmds.has(startedYmd));

  return (
    <div className="bg-[var(--bg-grouped-2)] rounded-[12px] px-5 py-4">
      <div className="flex items-center justify-between">
        <span className="text-[13px] uppercase tracking-[-0.08px] text-[var(--label-2)]">
          {t("rhythm.title")}
        </span>
        <span className="text-[13px] font-semibold text-[var(--soul)] tabular-nums">
          {t("rhythm.count", { done, total: RING_DAYS })}
        </span>
      </div>

      <div
        className="mt-3 flex items-center gap-2"
        role="img"
        aria-label={t("rhythm.footer", { done })}
      >
        {cells.map((ymd) => {
          const checked = checkedYmds.has(ymd);
          const isToday = ymd === todayYmd;
          const isStart = showStart && ymd === startedYmd;
          return (
            <div
              key={ymd}
              title={isToday ? t("rhythm.todayAria") : ymd}
              className="h-[10px] flex-1 rounded-full transition-colors duration-500"
              style={{
                background: checked
                  ? SOUL
                  : isStart
                    ? "rgba(216,90,48,0.28)"
                    : "rgba(0,0,0,0.07)",
                boxShadow: isToday ? `0 0 0 2px ${SOUL}44` : undefined,
              }}
            />
          );
        })}
      </div>

      <p className="mt-2 text-[13px] leading-[18px] tracking-[-0.08px] text-[var(--label-2)]">
        {t("rhythm.footer", { done })}
        {showStart && <span className="text-[var(--label-3)]"> · {t("rhythm.startCaption")}</span>}
      </p>
    </div>
  );
}
