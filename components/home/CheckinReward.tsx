"use client";

import { useT } from "@/lib/i18n";
import { growthStageOf } from "@/lib/growthStage";
import ProgressBar from "@/components/ui/ProgressBar";
import type { AffirmationCheckinDepth } from "@/types";

/* ─────────────────────────────────────────────────────────────────
 * CheckinReward — 체크인 직후 그 자리에 뜨는 즉시 보상.
 *
 * 왜 여기인가: 증거 장부·히트맵은 /progress 안에 있어 행동과 보상 사이가 멀었다.
 * 보상은 행동 직후·같은 화면에 있어야 학습된다(즉시성 — 지연될수록 연결이 약해진다).
 * 모달은 쓰지 않는다 — 앱의 차분한 톤을 깨지 않고 조용히 채워지는 편이 오래 간다.
 *
 * 표시 항목: 스트릭 일수 · 정체성 증거 +N(투표한 라벨) · 전체 새김 배지 · 프리즈 소비.
 * 프리즈 소비(freezeUsed)는 서버가 이미 돌려주는데 UI 가 쓰지 않던 값이다.
 *
 * "다시 볼 문장" 안내도 여기서 한다: focus 는 맞고 추가로 적은 줄만 틀린 경우
 * 체크인은 성공이라 이 카드가 체크인 카드를 덮는다 — 안내를 저쪽 푸터에 두면
 * 사용자가 볼 기회 자체가 없다.
 * ───────────────────────────────────────────────────────────────── */

export default function CheckinReward({
  streakCount,
  depth,
  evidenceVotes,
  evidenceTag,
  freezeUsed,
  growthVotes,
  extraMismatchCount = 0,
}: {
  streakCount: number;
  depth?: AffirmationCheckinDepth;
  /** 이번 체크인으로 적립된 오늘분 증거 표 수. 증거 적립이 실패했으면 undefined. */
  evidenceVotes?: number;
  evidenceTag?: string;
  freezeUsed?: number;
  /** 누적 증거 표 총합(이번 적립 반영 후) — 성장 단계 줄. 서버 준비 실패 시 undefined. */
  growthVotes?: number;
  /** 추가로 적었다가 어긋난 줄 수 — 성공을 깎지 않는 톤으로만 안내한다. */
  extraMismatchCount?: number;
}) {
  const t = useT();
  // 행동 직후가 보상이 가장 강하게 박히는 자리 — 총합·단계·진행바를 여기서 보여준다.
  const stage = growthStageOf(growthVotes);

  return (
    <div
      role="status"
      aria-live="polite"
      className="rounded-[12px] px-5 py-4"
      style={{ background: "rgba(216,90,48,0.08)" }}
    >
      <div className="flex items-start gap-3">
        <span
          className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ background: "#D85A30" }}
          aria-hidden
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12l5 5L20 7" />
          </svg>
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-[17px] font-semibold leading-[22px] tracking-[-0.43px] text-[var(--label)]">
              {t("checkin.reward.title")}
            </p>
            {depth === "full" && (
              <span
                className="flex-shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold tracking-[0.2px]"
                style={{ background: "rgba(30,27,75,0.10)", color: "#1E1B4B" }}
              >
                {t("checkin.reward.deepBadge")}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-[13px] leading-[18px] tracking-[-0.08px] text-[var(--label-2)]">
            {t("checkin.reward.streak", { count: streakCount })}
          </p>

          {/* 증거 적립이 실패(격리된 try-catch)했다면 이 줄 자체를 생략한다 — 거짓 보상 금지. */}
          {typeof evidenceVotes === "number" && evidenceVotes > 0 && (
            <p className="mt-2 text-[13px] leading-[18px] font-medium tracking-[-0.08px] text-[#D85A30]">
              {evidenceTag
                ? t("checkin.reward.evidence", { count: evidenceVotes, label: evidenceTag })
                : t("checkin.reward.evidencePlain", { count: evidenceVotes })}
            </p>
          )}

          {stage && (
            <div className="mt-2">
              <p className="text-[13px] leading-[18px] tracking-[-0.08px] text-[var(--label)]">
                <span aria-hidden>{stage.emoji}</span>{" "}
                <span className="font-semibold tabular-nums">
                  {t("growth.votes", { count: stage.votes })}
                </span>
                {" · "}
                {t(stage.labelKey)}
              </p>
              <ProgressBar pct={stage.progressPct} className="mt-1.5" />
              {stage.next !== null && (
                <p className="mt-1 text-[11px] tracking-[-0.08px] text-[var(--label-3)] tabular-nums">
                  {t("growth.toNext", { count: stage.votesToNext })}
                </p>
              )}
            </div>
          )}

          {typeof freezeUsed === "number" && freezeUsed > 0 && (
            <p className="mt-1.5 text-[13px] leading-[18px] tracking-[-0.08px] text-[var(--label-2)]">
              🧊 {t("checkin.reward.freeze", { count: freezeUsed })}
            </p>
          )}

          {extraMismatchCount > 0 && (
            <p className="mt-1.5 text-[13px] leading-[18px] tracking-[-0.08px] text-[var(--label-3)]">
              {t("affirmations.extra.mismatch")}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
