"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import {
  getAffirmationLogYmds,
  getDailyWinsHistory,
  getIdentityEvidenceRange,
} from "@/lib/firebase";
import { kstWeekday } from "@/lib/kstDate";
import { currentHomeMode, WEEKLY_REVIEW_WEEKDAY } from "@/lib/homeMode";
import {
  buildWeeklyReview,
  weeklyReviewFrom,
  WEEKLY_REVIEW_DAYS,
  type WeeklyReview,
} from "@/lib/weeklyReview";
import { useTodayData } from "@/lib/today-context";
import { useT } from "@/lib/i18n";
import TabHeader from "@/components/nav/TabHeader";
import SettingsButton from "@/components/nav/SettingsButton";
import LockedTeaserRow from "@/components/home/LockedTeaserRow";
import TodayWinsCard from "@/components/record/TodayWinsCard";
import TomorrowActionRow from "@/components/record/TomorrowActionRow";
import WeeklyReviewCard from "@/components/home/WeeklyReviewCard";

/* ─────────────────────────────────────────────────────────────────
 * 기록 탭 — 선택 입력의 집. 순서는 고정이다:
 *   ① 오늘 잘한 일 (잠겨 있으면 익명 잠금 행)
 *   ② 내일 첫 행동 1개 — 저녁 모드에만 나타난다(자리는 항상 ② — lib/homeMode 원칙)
 *   ③ 주간 회고 — 일요일 저녁에만, 입력 요구 0
 *
 * 오늘 문서·날짜·해금 판정은 탭 레이아웃의 TodayDataProvider 에서 받는다 — 탭을 옮겨도
 * 구독이 살아 있어 입력칸이 빈 채로 떴다가 채워지지 않는다.
 * 잘한 일 3칸도 꾸준함으로 벌어서 연다(lib/winsUnlock). 첫 스냅샷 전(null)에는 잠금 행조차
 * 그리지 않는다 — 열려 있던 기록이 한 프레임 잠겼다 풀리는 편이 더 나쁘다.
 * ───────────────────────────────────────────────────────────────── */

export default function RecordPage() {
  const router = useRouter();
  const { firebaseUser } = useAuth();
  const t = useT();
  const { uid, ymd, entry, entryLoaded, winsUnlock } = useTodayData();
  // 시간대 모드는 "무엇을 보여줄지"만 정한다 — 렌더마다 재계산해 화면을 열어둔 채
  // 시간 경계를 넘겨도 다음 렌더에 반영된다.
  const homeMode = currentHomeMode();

  /* ── 주간 회고 (일요일 저녁만) ──
   * 세 조회 모두 기존 함수 재사용. 집계는 lib/weeklyReview 순수 함수가 담당한다.
   * 조건을 만족하지 않으면 호출 자체를 하지 않아 평일엔 비용이 0이다. */
  const showWeeklyReview =
    homeMode === "evening" && kstWeekday(ymd) === WEEKLY_REVIEW_WEEKDAY;
  const [weeklyReview, setWeeklyReview] = useState<WeeklyReview | null>(null);

  useEffect(() => {
    if (!firebaseUser || !showWeeklyReview) return;
    let cancelled = false;
    const from = weeklyReviewFrom(ymd);
    void (async () => {
      try {
        const [checkinYmds, evidenceDays, winsHistory] = await Promise.all([
          getAffirmationLogYmds(firebaseUser.uid, from, ymd),
          getIdentityEvidenceRange(firebaseUser.uid, from, ymd),
          getDailyWinsHistory(firebaseUser.uid, WEEKLY_REVIEW_DAYS),
        ]);
        if (cancelled) return;
        setWeeklyReview(
          buildWeeklyReview({ checkinYmds, evidenceDays, winsHistory, toYmd: ymd }),
        );
      } catch (err) {
        console.error("[record] 주간 회고 조회 실패(카드 생략):", err);
        if (!cancelled) setWeeklyReview(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [firebaseUser, ymd, showWeeklyReview]);

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-[var(--bg-grouped)] pb-tabbar">
      <TabHeader
        title={t("record.title")}
        subtitle={t("record.subtitle")}
        trailing={<SettingsButton />}
      />

      <main className="mx-auto w-full max-w-3xl">
        {/* ① 오늘 잘한 일 — 열렸으면 입력 3칸(1칸 노출), 잠겼으면 정체를 감춘 잠금 행 */}
        {winsUnlock && (
          <div className="mx-4 mt-4 overflow-hidden rounded-[12px] bg-[var(--bg-grouped-2)]">
            {winsUnlock.kind === "open" ? (
              <TodayWinsCard
                uid={uid}
                ymd={ymd}
                entry={entry}
                entryLoaded={entryLoaded}
                onOpenHistory={() => router.push("/record/history")}
              />
            ) : (
              <LockedTeaserRow progress={winsUnlock.progress} threshold={winsUnlock.threshold} />
            )}
          </div>
        )}

        {/* ② 내일 첫 행동 1개 — 저녁에만 */}
        {homeMode === "evening" && (
          <div className="mx-4 mt-4 overflow-hidden rounded-[12px] bg-[var(--bg-grouped-2)]">
            <TomorrowActionRow uid={uid} ymd={ymd} entry={entry} entryLoaded={entryLoaded} />
          </div>
        )}

        {/* ③ 주간 회고 — 일요일 저녁만 */}
        {showWeeklyReview && weeklyReview && (
          <div className="px-4 pt-4">
            <WeeklyReviewCard review={weeklyReview} />
          </div>
        )}
      </main>
    </div>
  );
}
