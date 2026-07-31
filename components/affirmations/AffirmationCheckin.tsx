"use client";

import { useEffect, useMemo, useState } from "react";
import { useT } from "@/lib/i18n";
import type { AffirmationCheckinDepth } from "@/types";

/* ─────────────────────────────────────────────────────────────────
 * AffirmationCheckin — 하루 1줄이 기본, 전량 새김은 선택.
 *
 * 왜 1줄인가: 스트릭·정체성 증거를 여는 유일한 문이 다짐 전량 정확 전사였다.
 * 하루의 앵커 행동이 가장 비싸면 실행 빈도가 떨어진다(Fogg B=MAP — Ability 를
 * 낮춰야 행동이 유지된다). 필수치를 오늘 회전 1줄로 내리고, 전량 전사는
 * 정체성 증거 보너스가 붙는 선택지로 남겼다(의식은 삭제하지 않는다).
 *
 * 오늘의 줄은 lib/planRotation 의 pickTodayAffirmationIndex — 서버 체크인
 * 트랜잭션과 같은 순수 함수를 공유하므로 클라·서버 판정이 어긋나지 않는다.
 *
 * 디자인: Grouped inset 카드 · 번호 배지 indigo · 밑줄 입력 · 스트릭 칩 오렌지.
 * 실시간(onBlur) 빨간 점선 오류는 없앴다 — 타이핑 중 처벌 신호는 앵커 행동을 억제한다.
 * ───────────────────────────────────────────────────────────────── */

const AFFIRMATION_INPUT_MAX = 72;
const ROW_COLOR = "#1E1B4B";

/* 입력칸 — 카드(--bg-grouped-2) 안에 한 톤 눌러앉는 inset 필드.
   과거엔 border-b + inline borderWidth:1 이 네 변 전부에 먹어 각진 상자가 됐고,
   완료 상태에서 테두리가 ROW_COLOR 원색이라 크림 카드와 부딪혔다.
   색·모양은 클래스로만 정한다 — inline style 은 focus 변형을 이기므로 쓰지 않는다. */
const INPUT_BASE =
  "w-full rounded-[10px] border px-3.5 py-2.5 text-[17px] leading-[22px] tracking-[-0.43px] " +
  "text-[var(--label)] placeholder:text-[var(--label-3)] transition-colors " +
  "focus:outline-none focus:border-[var(--soul)] focus:bg-[var(--bg-grouped-2)] " +
  "disabled:opacity-50";
/** 완료 — 통과 신호는 배지 체크가 맡고, 입력칸은 옅은 indigo 로 가라앉힌다. */
const INPUT_TONE_DONE = "border-[rgba(30,27,75,0.16)] bg-[rgba(30,27,75,0.05)]";
/** 어긋남 — 빨강이 아니라 한 단계 진한 회색 실선("다시 볼 문장"). */
const INPUT_TONE_BAD = "border-[var(--sep-opaque)] bg-[var(--bg-grouped)]";
const INPUT_TONE_IDLE = "border-[var(--sep)] bg-[var(--bg-grouped)]";

function normalizeForCompare(s: string): string {
  return s.trim().replace(/\s+/g, " ").slice(0, AFFIRMATION_INPUT_MAX);
}
function stripLeadingNumber(s: string): string {
  return s.replace(/^\s*\d+\s*[.)\]]\s*/, "");
}

export interface CheckinSubmitResult {
  matched: boolean;
  streakCount: number;
  mismatchedIndices?: number[];
  focusIndex?: number;
  depth?: AffirmationCheckinDepth;
  evidenceVotes?: number;
  evidenceTag?: string;
  freezeUsed?: number;
  /** 목표 달성 스트릭 현재 연속일 — 서버 정산 반영 후 값. */
  goalStreakCount?: number;
  /** 누적 증거 표 총합(성장 단계 원천) — 보상 카드의 단계·진행바에 쓴다. */
  growthVotes?: number;
}

export default function AffirmationCheckin({
  affirmations,
  focusIndex,
  streakCount,
  alreadyCheckedIn,
  onSubmit,
  onCheckedIn,
}: {
  affirmations: string[];
  /** 오늘 새길 줄의 인덱스 — 홈이 pickTodayAffirmationIndex 로 계산해 내려준다. */
  focusIndex: number;
  streakCount: number;
  alreadyCheckedIn: boolean;
  /** 실제로 적은 줄만 인덱스와 함께 올린다(희소 제출). */
  onSubmit: (entries: Array<{ index: number; text: string }>) => Promise<CheckinSubmitResult>;
  /** 체크인 성공 직후 — 홈이 보상 카드/리듬 링을 갱신한다. */
  onCheckedIn?: (result: CheckinSubmitResult) => void;
}) {
  const t = useT();
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [expanded, setExpanded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  /** 제출 결과로 확정된 어긋난 인덱스 (실시간 검사는 하지 않는다). */
  const [mismatched, setMismatched] = useState<Set<number>>(() => new Set());
  /** focus 는 통과했는데 추가로 적은 줄만 틀린 경우 — 오류가 아니라 안내. */
  const [extraNotice, setExtraNotice] = useState(false);

  // 다짐 목록이나 오늘 날짜(=focusIndex)가 바뀌면 입력을 초기화한다.
  useEffect(() => {
    setDrafts({});
    setMismatched(new Set());
    setExtraNotice(false);
    setErrorMsg(null);
    setExpanded(false);
  }, [affirmations, focusIndex]);

  const targetNorm = useMemo(
    () => affirmations.map((a) => normalizeForCompare(stripLeadingNumber(a))),
    [affirmations],
  );

  // 유효 focus — 다짐 개수가 줄어든 직후 등 범위를 벗어난 값이 들어와도 첫 줄로 방어한다.
  const safeFocus =
    Number.isInteger(focusIndex) && focusIndex >= 0 && focusIndex < affirmations.length
      ? focusIndex
      : 0;

  // 펼침 여부에 따라 화면에 그릴 줄. 접힌 상태에선 오늘의 1줄만.
  const visibleIndices = expanded ? affirmations.map((_, i) => i) : [safeFocus];

  const focusFilled = (drafts[safeFocus] ?? "").trim().length > 0;

  const handleChange = (idx: number, value: string) => {
    setDrafts((prev) => ({ ...prev, [idx]: value.slice(0, AFFIRMATION_INPUT_MAX) }));
    // 고치는 순간 직전 제출의 오류 표시를 걷어낸다.
    if (mismatched.has(idx)) {
      setMismatched((prev) => {
        const next = new Set(prev);
        next.delete(idx);
        return next;
      });
    }
    if (errorMsg) setErrorMsg(null);
    if (extraNotice) setExtraNotice(false);
  };

  const handleSubmit = async () => {
    if (submitting || alreadyCheckedIn) return;
    // 실제로 적은 줄만 보낸다 — 빈 칸은 "안 한 선택"이므로 실패 사유가 되지 않는다.
    const entries = visibleIndices
      .filter((i) => (drafts[i] ?? "").trim().length > 0)
      .map((i) => ({ index: i, text: drafts[i] ?? "" }));

    if (!entries.some((e) => e.index === safeFocus)) {
      setErrorMsg(t("affirmations.focus.mismatch"));
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);
    setExtraNotice(false);
    try {
      const res = await onSubmit(entries);
      const badIndices = new Set(res.mismatchedIndices ?? []);
      if (res.matched) {
        // 성공 — focus 는 통과. 추가로 적었다가 틀린 줄이 있으면 안내만 남긴다.
        setMismatched(badIndices);
        setExtraNotice(badIndices.size > 0);
        onCheckedIn?.(res);
      } else {
        setMismatched(badIndices);
        setErrorMsg(t("affirmations.focus.mismatch"));
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (affirmations.length === 0) return null;

  return (
    <div className="bg-[var(--bg-grouped-2)] rounded-[12px] overflow-hidden">
      {/* 헤더 — 제목 + 회전 위치 + 스트릭 칩 */}
      <div className="flex items-center justify-between gap-2 px-5 pt-4 pb-2">
        <span className="text-[17px] font-semibold tracking-[-0.43px] text-[var(--label)]">
          {t("affirmations.focus.title")}
        </span>
        <div className="flex items-center gap-2">
          {!expanded && affirmations.length > 1 && (
            <span className="text-[12px] tracking-[-0.08px] text-[var(--label-3)] tabular-nums">
              {t("affirmations.focus.rotation", {
                index: safeFocus + 1,
                total: affirmations.length,
              })}
            </span>
          )}
          <span
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full"
            style={{ background: "rgba(255,149,0,0.16)" }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="#D85A30" aria-hidden>
              <path d="M13 2L4.5 13.5h6L9 22l8.5-11.5h-6L13 2z" />
            </svg>
            <span className="text-[12px] font-semibold tracking-[0.4px] text-[#D85A30]">
              {t("motivation.affirmations.streak", { count: streakCount })}
            </span>
          </span>
        </div>
      </div>

      <p className="px-5 pb-3 text-[13px] leading-[18px] tracking-[-0.08px] text-[var(--label-2)]">
        {alreadyCheckedIn
          ? t("motivation.affirmations.alreadyToday")
          : t("affirmations.focus.hint")}
      </p>

      {/* 줄 — 접힘: 오늘의 1줄만 / 펼침: 전량 */}
      <div>
        {visibleIndices.map((idx, pos) => {
          const target = affirmations[idx];
          const draft = drafts[idx] ?? "";
          const draftNorm = normalizeForCompare(stripLeadingNumber(draft));
          const isBad = mismatched.has(idx);
          // 일치는 즉시 초록 대신 배지 체크로만 알린다(정답 맞추기 게임이 아니다).
          const matched = draft.trim().length > 0 && draftNorm === targetNorm[idx];
          const done = alreadyCheckedIn || matched;
          const isLast = pos === visibleIndices.length - 1;

          return (
            <div key={idx} className="relative flex items-start gap-3 px-4 py-3">
              <div
                className="w-9 h-9 rounded-[10px] flex items-center justify-center flex-shrink-0 mt-0.5"
                style={{ background: done ? ROW_COLOR : ROW_COLOR + "1F" }}
              >
                {done ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12l5 5L20 7" />
                  </svg>
                ) : (
                  <span
                    className="text-[15px] font-bold tracking-[-0.3px]"
                    style={{ color: ROW_COLOR }}
                  >
                    {String(idx + 1).padStart(2, "0")}
                  </span>
                )}
              </div>

              <div className="flex-1 min-w-0">
                {/* 원문 — 접힘 상태에선 오늘의 한 줄이 주인공이라 크게 보여준다. */}
                <div
                  className={
                    expanded
                      ? "text-[13px] leading-[18px] tracking-[-0.08px] text-[var(--label-3)] mb-1"
                      : "text-[17px] leading-[23px] tracking-[-0.43px] font-medium text-[var(--label)] mb-2"
                  }
                >
                  {target}
                </div>

                <input
                  value={alreadyCheckedIn ? target : draft}
                  readOnly={alreadyCheckedIn}
                  disabled={submitting && !alreadyCheckedIn}
                  placeholder={t("affirmations.focus.placeholder")}
                  maxLength={AFFIRMATION_INPUT_MAX}
                  onChange={(e) => handleChange(idx, e.target.value)}
                  aria-label={`${idx + 1} — ${target}`}
                  aria-invalid={isBad || undefined}
                  /* autoFocus 는 쓰지 않는다 — 홈 진입만으로 키보드가 올라오면 훑어보기를 방해한다.
                     재약속 카드의 "지금 체크인하기" 는 홈이 스크롤 후 이 input 에 포커스를 준다. */
                  className={`${INPUT_BASE} ${
                    done ? INPUT_TONE_DONE : isBad ? INPUT_TONE_BAD : INPUT_TONE_IDLE
                  }`}
                />

                {isBad && !alreadyCheckedIn && (
                  <p className="mt-1 text-[12px] tracking-[-0.08px] text-[var(--label-3)]">
                    → {target}
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
      </div>

      {/* 푸터 — 체크인 + 전량 새김 토글 */}
      {!alreadyCheckedIn && (
        <div className="border-t border-[var(--sep)] px-5 py-3">
          <div className="flex items-center justify-end gap-4">
            {errorMsg ? (
              <span className="mr-auto text-[13px] text-[#FF3B30]">{errorMsg}</span>
            ) : extraNotice ? (
              <span className="mr-auto text-[13px] text-[var(--label-2)]">
                {t("affirmations.extra.mismatch")}
              </span>
            ) : null}
            {affirmations.length > 1 && (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                disabled={submitting}
                className="text-[13px] font-medium text-[var(--label-2)] disabled:opacity-40"
              >
                {expanded
                  ? t("affirmations.focus.collapse")
                  : `⌄ ${t("affirmations.focus.expand", { count: affirmations.length })}`}
              </button>
            )}
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || !focusFilled}
              className="text-[15px] font-semibold text-[var(--soul)] disabled:opacity-30"
            >
              {submitting
                ? t("motivation.affirmations.checkingIn")
                : t("motivation.affirmations.checkin")}
            </button>
          </div>
          {expanded && affirmations.length > 1 && (
            <p className="mt-2 text-[12px] leading-[16px] tracking-[-0.08px] text-[var(--label-3)]">
              {t("affirmations.focus.deepHint")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
