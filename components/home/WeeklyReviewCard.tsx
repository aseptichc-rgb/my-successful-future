"use client";

import { useLanguage } from "@/lib/i18n";
import type { WeeklyReview } from "@/lib/weeklyReview";

/* ─────────────────────────────────────────────────────────────────
 * WeeklyReviewCard — 일요일 저녁에만 뜨는 주간 회고. 입력 요구 0.
 *
 * 자기 모니터링은 BCT 메타분석에서 효과 최상위 기법이지만, 사용자에게 회고를
 * "쓰라고" 하면 부담이 되어 실행되지 않는다. 그래서 쓰게 하지 않고 보여준다 —
 * 이미 쌓인 데이터(체크인 날짜·잘한 일·증거 표)만 되돌려주는 읽기 전용 카드다.
 *
 * LLM 을 쓰지 않는다: 쿼터·지연·실패 모드를 늘리지 않고 오프라인에서도 같은 숫자가 나온다.
 * 집계는 lib/weeklyReview 의 순수 함수가 담당하고 이 컴포넌트는 표현만 한다.
 * ───────────────────────────────────────────────────────────────── */

function formatShortDate(ymd: string, locale: string): string {
  const [y, m, d] = ymd.split("-").map((s) => parseInt(s, 10));
  if (!y || !m || !d) return ymd;
  try {
    const tag =
      locale === "ko" ? "ko-KR" : locale === "es" ? "es-ES" : locale === "zh" ? "zh-CN" : "en-US";
    return new Intl.DateTimeFormat(tag, {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    }).format(new Date(Date.UTC(y, m - 1, d)));
  } catch {
    return ymd;
  }
}

export default function WeeklyReviewCard({ review }: { review: WeeklyReview }) {
  const { t, locale } = useLanguage();
  const isEmpty =
    review.checkinDays === 0 && review.winCount === 0 && review.evidenceVotes === 0;

  const stats: Array<{ key: string; label: string }> = [
    { key: "checkin", label: t("weekly.checkinDays", { count: review.checkinDays }) },
    { key: "wins", label: t("weekly.wins", { count: review.winCount }) },
    { key: "evidence", label: t("weekly.evidence", { count: review.evidenceVotes }) },
  ];

  return (
    <div className="bg-[var(--bg-grouped-2)] rounded-[12px] px-5 py-4">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[17px] font-semibold tracking-[-0.43px] text-[var(--label)]">
          {t("weekly.title")}
        </span>
        <span className="text-[12px] tracking-[-0.08px] text-[var(--label-3)] tabular-nums">
          {formatShortDate(review.from, locale)} – {formatShortDate(review.to, locale)}
        </span>
      </div>

      {isEmpty ? (
        <p className="mt-2 text-[15px] leading-[21px] tracking-[-0.24px] text-[var(--label-2)]">
          {t("weekly.empty")}
        </p>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap gap-2">
            {stats.map((s) => (
              <span
                key={s.key}
                className="rounded-full px-3 py-1 text-[13px] font-medium tracking-[-0.08px]"
                style={{ background: "rgba(30,27,75,0.07)", color: "#1E1B4B" }}
              >
                {s.label}
              </span>
            ))}
          </div>
          {review.topIdentity && (
            <p className="mt-3 text-[15px] leading-[21px] tracking-[-0.24px] font-medium text-[var(--label)]">
              {t("weekly.topIdentity", { label: review.topIdentity })}
            </p>
          )}
        </>
      )}

      <p className="mt-3 text-[12px] leading-[16px] tracking-[-0.08px] text-[var(--label-3)]">
        {t("weekly.footer")}
      </p>
    </div>
  );
}
