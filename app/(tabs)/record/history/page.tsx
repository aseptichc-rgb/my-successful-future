"use client";

import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { getDailyWinsHistory, WINS_HISTORY_DEFAULT_LIMIT } from "@/lib/firebase";
import { useRetryableLoad } from "@/lib/useRetryableLoad";
import { backOrReplace } from "@/lib/navigation";
import { useLanguage } from "@/lib/i18n";
import TabHeader from "@/components/nav/TabHeader";
import BackButton from "@/components/nav/BackButton";

/* ─────────────────────────────────────────────────────────────────
 * Wins History — 기록 탭의 하위 페이지 (/record/history)
 *  · Large Title nav with back button (← 오늘의 기록) — 탭 바는 그대로, 기록 탭이 켜진 채
 *  · Per-day grouped inset card with rotating system colors
 *  · Empty / error / loading states match iOS conventions
 *  인증 게이트는 (tabs)/layout 이 담당한다.
 * ───────────────────────────────────────────────────────────────── */

// Day-of-week color rotation (iOS palette).
const DAY_COLORS = ["#D85A30", "#D85A30", "#1E1B4B", "#1E1B4B", "#1E1B4B", "#1E1B4B", "#FFCC00"];

/** 모듈 함수로 두어 참조가 안정 — useRetryableLoad 가 불필요하게 재조회하지 않는다. */
const loadWinsHistory = (uid: string) => getDailyWinsHistory(uid, WINS_HISTORY_DEFAULT_LIMIT);

function formatKstDate(ymd: string, locale: string): string {
  const [y, m, d] = ymd.split("-").map((s) => parseInt(s, 10));
  if (!y || !m || !d) return ymd;
  try {
    const date = new Date(Date.UTC(y, m - 1, d));
    const tag =
      locale === "ko" ? "ko-KR" : locale === "es" ? "es-ES" : locale === "zh" ? "zh-CN" : "en-US";
    return new Intl.DateTimeFormat(tag, {
      year: "numeric",
      month: "long",
      day: "numeric",
      weekday: "short",
      timeZone: "UTC",
    }).format(date);
  } catch {
    return ymd;
  }
}

function todayOffsetLabel(ymd: string): string | null {
  try {
    const [y, m, d] = ymd.split("-").map((s) => parseInt(s, 10));
    const that = new Date(Date.UTC(y, m - 1, d));
    const now = new Date();
    const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    const diff = Math.round((today.getTime() - that.getTime()) / 86400000);
    if (diff === 0) return "오늘";
    if (diff === 1) return "어제";
    return null;
  } catch {
    return null;
  }
}

export default function WinsHistoryPage() {
  const router = useRouter();
  const { firebaseUser } = useAuth();
  const { t, locale } = useLanguage();

  const { data, loading, failed, retry } = useRetryableLoad(firebaseUser, loadWinsHistory);
  const entries = data ?? [];
  const error = failed ? t("wins.history.loadFailed") : null;

  // Filter entries that have at least one non-empty win
  const filledEntries = entries.filter((e) => e.wins.some((w) => (w || "").trim().length > 0));

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-[var(--bg-grouped)] pb-tabbar">
      <TabHeader
        title={t("wins.history.title")}
        subtitle={t("wins.history.subtitle")}
        leading={
          <BackButton
            label={t("record.title")}
            onClick={() => backOrReplace(router, "/record")}
          />
        }
      />

      <main className="mx-auto w-full max-w-3xl">
        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="h-6 w-6 animate-spin rounded-full border-[1.5px] border-black/10 border-t-[#D85A30]" />
          </div>
        )}

        {!loading && error && (
          <div className="mx-4 mt-4 rounded-[12px] bg-[var(--bg-grouped-2)] p-4 text-[15px] text-[#FF3B30] flex items-center gap-3">
            <span className="flex-1">{error}</span>
            <button
              type="button"
              onClick={retry}
              className="text-[15px] font-semibold text-[var(--soul)]"
            >
              {t("common.retry")}
            </button>
          </div>
        )}

        {!loading && !error && filledEntries.length === 0 && (
          <div className="mx-4 mt-12 text-center px-6 py-12">
            <div
              className="mx-auto w-16 h-16 rounded-[18px] flex items-center justify-center mb-4"
              style={{
                background: "linear-gradient(135deg, #1E1B4B 0%, #2A2766 100%)",
                boxShadow: "0 6px 18px rgba(30,27,75,0.18)",
              }}
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12l5 5L20 7" />
              </svg>
            </div>
            <p className="text-[17px] leading-[22px] text-[var(--label-2)]">
              {t("wins.history.empty") || "아직 기록한 잘한 일이 없어요."}
            </p>
          </div>
        )}

        {!loading && !error && filledEntries.length > 0 && (
          <div className="pb-8">
            {filledEntries.map((entry, di) => {
              const dayColor = DAY_COLORS[di % DAY_COLORS.length];
              const label = todayOffsetLabel(entry.ymd);
              const longDate = formatKstDate(entry.ymd, locale);
              const header = label ? `${label} · ${longDate}` : longDate;
              const filledWins = entry.wins.filter((w) => (w || "").trim().length > 0);

              return (
                <section key={entry.ymd} className="mt-7">
                  <div className="px-7 mb-1.5 text-[13px] uppercase tracking-[-0.08px] text-[var(--label-2)]">
                    {header}
                  </div>
                  <div className="mx-4 bg-[var(--bg-grouped-2)] rounded-[12px] overflow-hidden">
                    {filledWins.map((win, i) => {
                      const isLast = i === filledWins.length - 1;
                      return (
                        <div
                          key={i}
                          className="relative flex items-start gap-3 px-4 py-3"
                        >
                          <div
                            className="w-7 h-7 rounded-[8px] flex items-center justify-center flex-shrink-0 mt-0.5"
                            style={{ background: dayColor + "1F" }}
                          >
                            <span
                              className="text-[13px] font-bold tracking-[-0.2px]"
                              style={{ color: dayColor }}
                            >
                              {String(i + 1).padStart(2, "0")}
                            </span>
                          </div>
                          <p className="flex-1 text-[17px] leading-[24px] tracking-[-0.43px] text-[var(--label)] whitespace-pre-wrap py-1">
                            {win}
                          </p>
                          {!isLast && (
                            <div
                              className="absolute bottom-0 right-0 h-[0.5px]"
                              style={{ left: 56, background: "var(--sep)" }}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
