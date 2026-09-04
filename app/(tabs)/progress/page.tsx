"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import {
  getAffirmationLogYmds,
  getIdentityEvidenceRange,
  getKstYmd,
  onIdentityProgressSnapshot,
} from "@/lib/firebase";
import { addKstDays, kstMonth } from "@/lib/kstDate";
import { useRetryableLoad } from "@/lib/useRetryableLoad";
import { FREEZES_PER_MONTH } from "@/lib/constants/streak";
import { growthStageOf } from "@/lib/growthStage";
import GroupedSection from "@/components/ui/GroupedSection";
import ProgressBar from "@/components/ui/ProgressBar";
import TabHeader from "@/components/nav/TabHeader";
import SettingsButton from "@/components/nav/SettingsButton";
import { useLanguage, type DictKey } from "@/lib/i18n";
import type { IdentityProgress } from "@/types";

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

type SourceKey = "mission" | "checkin" | "deep" | "goal" | "win";
const SOURCE_ORDER: SourceKey[] = ["checkin", "deep", "goal", "win", "mission"];
/** 출처 → i18n 라벨 키 (템플릿 리터럴은 DictKey 타입 검증을 못 받으므로 명시 맵). */
const SOURCE_LABEL_KEY: Record<SourceKey, DictKey> = {
  checkin: "progress.source.checkin",
  deep: "progress.source.deep",
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
  // 인증 게이트는 (tabs)/layout 이 담당 — 여기 도달했으면 로그인·온보딩이 끝난 상태다.
  const { user, firebaseUser } = useAuth();
  const { t, locale } = useLanguage();

  const [identityRows, setIdentityRows] = useState<IdentityProgress[]>([]);

  const today = getKstYmd();

  // 히트맵 + 증거 피드 — 두 조회를 한 번에. today 가 바뀌면(자정 롤오버) 다시 조회한다.
  const loadProgress = useCallback(
    async (uid: string) => {
      const from = addKstDays(today, -(HEATMAP_DAYS - 1));
      const evidenceFrom = addKstDays(today, -(EVIDENCE_FEED_DAYS - 1));
      const [ymds, evidence] = await Promise.all([
        getAffirmationLogYmds(uid, from, today),
        getIdentityEvidenceRange(uid, evidenceFrom, today),
      ]);
      return { checkedYmds: new Set(ymds), evidenceDays: evidence };
    },
    [today],
  );
  const { data, failed, retry } = useRetryableLoad(firebaseUser, loadProgress);
  // 실패 시에는 빈 히트맵 + 오류 문구(재시도)로 그린다 — 스켈레톤에 갇히지 않게.
  const checkedYmds = data ? data.checkedYmds : failed ? new Set<string>() : null;
  const evidenceDays = data?.evidenceDays ?? [];
  const error = failed ? t("progress.loadFailed") : null;

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

  const streak = user?.affirmationStreak;
  const count = streak?.count ?? 0;
  // 레거시 문서(bestCount 없음)는 현재 count 를 최고기록으로 간주 — 서버 백필과 동일 폴백.
  const best = Math.max(streak?.bestCount ?? count, count);
  // 성장 단계 — 누적 증거 표(서버 전용 growth.votes). 표가 없으면 히어로를 통째로 생략.
  const growthStage = growthStageOf(user?.growth?.votes);
  // 목표 지킨 날 누적 — goalStreak 미보유(레거시/신규) 계정은 줄 자체를 생략.
  const goalDays = user?.goalStreak?.totalDays ?? 0;
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
    <div className="flex h-full flex-col overflow-y-auto bg-[var(--bg-grouped)] pb-tabbar">
      <TabHeader title={t("progress.title")} trailing={<SettingsButton />} />

      <main className="mx-auto w-full max-w-3xl">
        {error && (
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

        {/* ── 성장 단계 히어로 — 누적 증거 표가 쌓아 올린 단계(씨앗→…→숲) ── */}
        {growthStage && (
          <GroupedSection footer={t("growth.subtitle")}>
            <div className="flex items-center gap-4 px-5 py-5">
              <div
                className="w-14 h-14 rounded-[16px] flex items-center justify-center flex-shrink-0 text-[26px]"
                style={{ background: "rgba(30,27,75,0.08)" }}
                aria-hidden
              >
                {growthStage.emoji}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] tracking-[-0.08px] text-[var(--label-2)]">
                  {t("growth.title")}
                </p>
                <p className="text-[28px] font-bold leading-[34px] tracking-[-0.4px] text-[var(--label)]">
                  {t(growthStage.labelKey)}
                </p>
                <p className="mt-0.5 text-[13px] tracking-[-0.08px] text-[var(--label-2)] tabular-nums">
                  {t("growth.votes", { count: growthStage.votes })}
                  {growthStage.next !== null && (
                    <> · {t("growth.toNext", { count: growthStage.votesToNext })}</>
                  )}
                </p>
                <ProgressBar pct={growthStage.progressPct} className="mt-2" />
              </div>
            </div>
          </GroupedSection>
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
              {goalDays > 0 && (
                <p className="mt-0.5 text-[13px] tracking-[-0.08px] text-[var(--label-2)] tabular-nums">
                  {t("progress.goalDays", { count: goalDays })}
                </p>
              )}
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
