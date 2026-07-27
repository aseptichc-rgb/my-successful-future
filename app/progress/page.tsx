"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import {
  getAffirmationLogYmds,
  getIdentityEvidenceRange,
  getKstYmd,
  onIdentityProgressSnapshot,
} from "@/lib/firebase";
import { addKstDays, kstMonth } from "@/lib/kstDate";
import { FREEZES_PER_MONTH } from "@/lib/constants/streak";
import GroupedSection from "@/components/ui/GroupedSection";
import { useLanguage, type DictKey } from "@/lib/i18n";
import type { IdentityEvidenceDay, IdentityProgress } from "@/types";

/* ─────────────────────────────────────────────────────────────────
 * Progress — 스트릭 회복탄력성 + 정체성 증거 장부
 *  · 스트릭 히어로 (현재/최고/이번 달 얼음)
 *  · 최근 30일 히트맵 + 일관성 % (자기 모니터링 — BCT 메타분석 최상위 기법)
 *  · 정체성 증거 장부 — onIdentityProgressSnapshot 의 첫 UI 소비자
 * ───────────────────────────────────────────────────────────────── */

/** 히트맵 기간(일). 일관성 % 분모와 동일해야 한다. */
const HEATMAP_DAYS = 30;
/** 최근 증거 피드 조회 기간(일). */
const EVIDENCE_FEED_DAYS = 14;
/** 증거 피드에 그리는 최대 행 수 — 화면 비대 방지. */
const EVIDENCE_FEED_MAX_ROWS = 20;

const SOUL = "#D85A30";
const STREAK_CHIP_BG = "rgba(255,149,0,0.16)";

type SourceKey = "mission" | "checkin" | "goal" | "win";
const SOURCE_ORDER: SourceKey[] = ["checkin", "goal", "win", "mission"];
/** 출처 → i18n 라벨 키 (템플릿 리터럴은 DictKey 타입 검증을 못 받으므로 명시 맵). */
const SOURCE_LABEL_KEY: Record<SourceKey, DictKey> = {
  checkin: "progress.source.checkin",
  goal: "progress.source.goal",
  win: "progress.source.win",
  mission: "progress.source.mission",
};

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

const IconBolt = ({ size = 14, color = SOUL }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden>
    <path d="M13 2L4.5 13.5h6L9 22l8.5-11.5h-6L13 2z" />
  </svg>
);

export default function ProgressPage() {
  const router = useRouter();
  const { user, firebaseUser, loading: authLoading } = useAuth();
  const { t, locale } = useLanguage();

  const [checkedYmds, setCheckedYmds] = useState<Set<string> | null>(null);
  const [evidenceDays, setEvidenceDays] = useState<IdentityEvidenceDay[]>([]);
  const [identityRows, setIdentityRows] = useState<IdentityProgress[]>([]);
  const [error, setError] = useState<string | null>(null);

  const today = getKstYmd();

  useEffect(() => {
    if (authLoading) return;
    if (!firebaseUser) router.replace("/login");
  }, [authLoading, firebaseUser, router]);

  const load = useCallback(
    async (uid: string) => {
      setError(null);
      try {
        const from = addKstDays(today, -(HEATMAP_DAYS - 1));
        const evidenceFrom = addKstDays(today, -(EVIDENCE_FEED_DAYS - 1));
        const [ymds, evidence] = await Promise.all([
          getAffirmationLogYmds(uid, from, today),
          getIdentityEvidenceRange(uid, evidenceFrom, today),
        ]);
        setCheckedYmds(new Set(ymds));
        setEvidenceDays(evidence);
      } catch (err) {
        console.error("[progress] 조회 실패:", err);
        setCheckedYmds(new Set());
        setError(t("progress.loadFailed"));
      }
    },
    [today, t],
  );

  useEffect(() => {
    if (!firebaseUser) return;
    void load(firebaseUser.uid);
  }, [firebaseUser, load]);

  useEffect(() => {
    if (!firebaseUser) return;
    const unsub = onIdentityProgressSnapshot(
      firebaseUser.uid,
      (entries) => {
        setIdentityRows([...entries].sort((a, b) => (b.count ?? 0) - (a.count ?? 0)));
      },
      () => {
        // 구독 실패 시 장부 섹션만 빈 상태로 남긴다 — 나머지 화면은 정상 동작.
      },
    );
    return unsub;
  }, [firebaseUser]);

  // 히트맵 셀: 오래된 날짜 → 오늘 순.
  const heatmapCells = useMemo(() => {
    return Array.from({ length: HEATMAP_DAYS }, (_, i) =>
      addKstDays(today, -(HEATMAP_DAYS - 1 - i)),
    );
  }, [today]);

  if (authLoading || !firebaseUser) {
    return (
      <div className="flex h-full items-center justify-center bg-[var(--bg-grouped)]">
        <div className="h-6 w-6 animate-spin rounded-full border-[1.5px] border-black/10 border-t-[#D85A30]" />
      </div>
    );
  }

  const streak = user?.affirmationStreak;
  const count = streak?.count ?? 0;
  // 레거시 문서(bestCount 없음)는 현재 count 를 최고기록으로 간주 — 서버 백필과 동일 폴백.
  const best = Math.max(streak?.bestCount ?? count, count);
  const freezesLeft =
    streak?.freezeMonth === kstMonth(today)
      ? Math.max(0, streak?.freezesLeft ?? FREEZES_PER_MONTH)
      : FREEZES_PER_MONTH;

  const checkedCount = checkedYmds
    ? heatmapCells.filter((ymd) => checkedYmds.has(ymd)).length
    : 0;
  const consistencyPct = Math.round((checkedCount / HEATMAP_DAYS) * 100);

  // 증거 피드 행: 날짜 내림차순 그대로 평탄화.
  const evidenceRows = evidenceDays
    .flatMap((day) =>
      (Array.isArray(day.entries) ? day.entries : []).map((entry) => ({
        ymd: day.ymd,
        entry,
      })),
    )
    .slice(0, EVIDENCE_FEED_MAX_ROWS);

  const sourceLabel = (source: SourceKey): string => t(SOURCE_LABEL_KEY[source]);

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-[var(--bg-grouped)] pb-12">
      <header className="pt-3 pb-2 bg-[var(--bg-grouped)]">
        <div className="mx-auto max-w-3xl px-2 min-h-[44px] flex items-center">
          <button
            type="button"
            onClick={() => router.push("/home")}
            aria-label={t("home.title")}
            className="inline-flex items-center gap-1 text-[var(--soul)] text-[17px] tracking-[-0.43px] px-1 py-2"
          >
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
              <path d="M14 4l-7 7 7 7" stroke="#D85A30" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>{t("home.title")}</span>
          </button>
        </div>
        <div className="mx-auto max-w-3xl px-5">
          <h1 className="text-large-title font-display">{t("progress.title")}</h1>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl">
        {error && (
          <div className="mx-4 mt-4 rounded-[12px] bg-[var(--bg-grouped-2)] p-4 text-[15px] text-[#FF3B30] flex items-center gap-3">
            <span className="flex-1">{error}</span>
            <button
              type="button"
              onClick={() => firebaseUser && void load(firebaseUser.uid)}
              className="text-[15px] font-semibold text-[var(--soul)]"
            >
              {t("common.retry")}
            </button>
          </div>
        )}

        {/* ── 스트릭 히어로 ── */}
        <GroupedSection
          footer={t("progress.freeze.desc", { max: FREEZES_PER_MONTH })}
        >
          <div className="flex items-center gap-4 px-5 py-5">
            <div
              className="w-14 h-14 rounded-[16px] flex items-center justify-center flex-shrink-0"
              style={{ background: STREAK_CHIP_BG }}
            >
              <IconBolt size={26} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] tracking-[-0.08px] text-[var(--label-2)]">
                {t("progress.streak.current")}
              </p>
              <p className="text-[28px] font-bold leading-[34px] tracking-[-0.4px] text-[var(--label)]">
                {t("progress.streak.days", { count })}
              </p>
              <p className="mt-0.5 text-[13px] tracking-[-0.08px] text-[var(--label-2)]">
                {t("progress.streak.best", { count: best })}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[13px] tracking-[-0.08px] text-[var(--label-2)]">
                {t("progress.freeze.label")}
              </p>
              <p className="text-[20px] font-semibold text-[var(--label)] tabular-nums">
                {"🧊".repeat(freezesLeft) || "0"}
                <span className="ml-1 text-[13px] font-normal text-[var(--label-3)]">
                  {freezesLeft}/{FREEZES_PER_MONTH}
                </span>
              </p>
            </div>
          </div>
        </GroupedSection>

        {/* ── 30일 히트맵 + 일관성 % ── */}
        <GroupedSection
          header={t("progress.heatmap.title")}
          trailing={
            checkedYmds ? (
              <span className="text-[13px] font-semibold text-[var(--soul)] tabular-nums">
                {t("progress.consistency", { pct: consistencyPct })}
              </span>
            ) : null
          }
        >
          <div className="px-5 py-4">
            {!checkedYmds ? (
              <div className="flex items-center justify-center py-6">
                <div className="h-5 w-5 animate-spin rounded-full border-[1.5px] border-black/10 border-t-[#D85A30]" />
              </div>
            ) : (
              <div className="grid grid-cols-10 gap-[6px]" role="img" aria-label={t("progress.heatmap.title")}>
                {heatmapCells.map((ymd) => {
                  const checked = checkedYmds.has(ymd);
                  const isToday = ymd === today;
                  return (
                    <div
                      key={ymd}
                      title={ymd}
                      className="aspect-square rounded-[5px]"
                      style={{
                        background: checked ? SOUL : "rgba(0,0,0,0.06)",
                        boxShadow: isToday ? `0 0 0 2px ${SOUL}55` : undefined,
                      }}
                    />
                  );
                })}
              </div>
            )}
          </div>
        </GroupedSection>

        {/* ── 정체성 증거 장부 ── */}
        <GroupedSection
          header={t("progress.identity.title")}
          footer={t("progress.identity.subtitle")}
        >
          {identityRows.length === 0 ? (
            <p className="px-5 py-4 text-[15px] leading-[20px] text-[var(--label-3)]">
              {t("progress.identity.empty")}
            </p>
          ) : (
            identityRows.map((row, idx) => {
              const isLast = idx === identityRows.length - 1;
              // 레거시 문서(sourceCounts 없음)는 미션 응답만 쌓이던 시절 — 전량 미션으로 표기.
              const sc = row.sourceCounts;
              const chips = sc
                ? SOURCE_ORDER.map((source) => ({ source, n: sc[source] ?? 0 })).filter(
                    (c) => c.n > 0,
                  )
                : row.count > 0
                  ? [{ source: "mission" as SourceKey, n: row.count }]
                  : [];
              return (
                <div key={row.identityTag} className="relative px-5 py-3">
                  <div className="flex items-center gap-3">
                    <span className="flex-1 min-w-0 text-[17px] leading-[22px] tracking-[-0.43px] text-[var(--label)] truncate">
                      {t("progress.identity.iAm", { label: row.identityTag })}
                    </span>
                    <span
                      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[13px] font-semibold tabular-nums"
                      style={{ background: "rgba(30,27,75,0.08)", color: "#1E1B4B" }}
                    >
                      {t("progress.identity.votes", { count: row.count ?? 0 })}
                    </span>
                  </div>
                  {chips.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {chips.map((c) => (
                        <span
                          key={c.source}
                          className="text-[11px] px-1.5 py-0.5 rounded-[5px] text-[var(--label-2)]"
                          style={{ background: "rgba(0,0,0,0.05)" }}
                        >
                          {sourceLabel(c.source)} {c.n}
                        </span>
                      ))}
                    </div>
                  )}
                  {!isLast && (
                    <div
                      className="absolute bottom-0 right-0 h-[0.5px]"
                      style={{ left: 20, background: "var(--sep)" }}
                    />
                  )}
                </div>
              );
            })
          )}
        </GroupedSection>

        {/* ── 최근 증거 피드 ── */}
        {evidenceRows.length > 0 && (
          <GroupedSection header={t("progress.evidence.title")}>
            {evidenceRows.map(({ ymd, entry }, idx) => {
              const isLast = idx === evidenceRows.length - 1;
              return (
                <div key={`${ymd}-${idx}`} className="relative flex items-center gap-3 px-5 py-3">
                  <span className="w-14 flex-shrink-0 text-[12px] text-[var(--label-3)] tabular-nums">
                    {formatShortDate(ymd, locale)}
                  </span>
                  <span
                    className="flex-shrink-0 text-[11px] px-1.5 py-0.5 rounded-[5px] text-[var(--label-2)]"
                    style={{ background: "rgba(0,0,0,0.05)" }}
                  >
                    {sourceLabel(entry.source as SourceKey)}
                  </span>
                  <span className="flex-1 min-w-0 text-[14px] leading-[19px] text-[var(--label)] truncate">
                    {entry.detail || entry.identityTag}
                  </span>
                  {!isLast && (
                    <div
                      className="absolute bottom-0 right-0 h-[0.5px]"
                      style={{ left: 20, background: "var(--sep)" }}
                    />
                  )}
                </div>
              );
            })}
          </GroupedSection>
        )}
      </main>
    </div>
  );
}
