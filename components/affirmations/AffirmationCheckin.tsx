"use client";

import { useEffect, useMemo, useState } from "react";
import { useT } from "@/lib/i18n";

/**
 * 입력 필드 최대 길이 — 저장된 다짐(60자) + "10. " 같은 번호 프리픽스(최대 4자) 여유.
 * 비교 정규화에서도 같은 한도를 써야 잘림으로 인한 mismatch 가 안 생긴다.
 */
const AFFIRMATION_INPUT_MAX = 72;

/**
 * 다짐 따라쓰기 체크인 UI — MotivationCard 안에서 카드 톤(dark/light)을 그대로 따른다.
 *
 * - props.affirmations 가 비면 아무것도 렌더하지 않음 (호출부에서 CTA 처리).
 * - props.alreadyCheckedIn 이면 입력창 대신 "오늘 완료" 상태로 잠금.
 * - 각 행은 "1. 나는 …", "2. 나는 …" 형식 placeholder 로 노출되고, 사용자는 번호까지
 *   포함해 그대로 다시 적어야 한 줄 일치로 인정된다 (서버 비교도 동일 규칙).
 * - 부분 일치는 빨간 테두리로 즉시 피드백, 모두 일치하면 "기록하기" 활성화.
 */
function normalizeForCompare(s: string): string {
  return s.trim().replace(/\s+/g, " ").slice(0, AFFIRMATION_INPUT_MAX);
}

/**
 * 사용자가 실수로 placeholder 의 번호("1. ", "10. " 등) 를 같이 적어도 통과시키기 위해
 * 비교 직전에 선두 번호 프리픽스를 떨어뜨린다. 본문만 일치하면 OK.
 */
function stripLeadingNumber(s: string): string {
  return s.replace(/^\s*\d+\s*[.)\]]\s*/, "");
}

export default function AffirmationCheckin({
  affirmations,
  tone,
  streakCount,
  alreadyCheckedIn,
  onSubmit,
}: {
  affirmations: string[];
  tone: "dark" | "light";
  streakCount: number;
  alreadyCheckedIn: boolean;
  /**
   * 사용자가 N개 입력을 보낼 때 호출. 서버 응답으로 matched/streakCount 를 돌려받는다.
   * 호출부가 alreadyCheckedIn / streakCount prop 을 갱신해 다시 내려줘야 UI 가 잠긴다.
   */
  onSubmit: (
    texts: string[],
  ) => Promise<{ matched: boolean; streakCount: number; mismatchedIndices?: number[] }>;
}) {
  const t = useT();
  const [drafts, setDrafts] = useState<string[]>(() => affirmations.map(() => ""));
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [mismatched, setMismatched] = useState<Set<number>>(() => new Set());
  /** 행에서 포커스가 빠져나간 적이 있는지 — blur 후에만 라이브 안내를 보여주기 위함. */
  const [blurred, setBlurred] = useState<Set<number>>(() => new Set());
  const [flash, setFlash] = useState<string | null>(null);

  // 다짐이 바뀌면 드래프트도 맞춰서 재초기화 (개수/순서 변경 케이스).
  useEffect(() => {
    setDrafts(affirmations.map(() => ""));
    setMismatched(new Set());
    setBlurred(new Set());
    setErrorMsg(null);
  }, [affirmations]);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 2400);
    return () => clearTimeout(t);
  }, [flash]);

  const allFilled = drafts.every((d) => d.trim().length > 0);

  // 비교는 본문만 — 번호는 화면 왼쪽 뱃지로만 표시되고 입력값에 들어오지 않는 게 정상이다.
  const targetNorm = useMemo(
    () => affirmations.map((t) => normalizeForCompare(stripLeadingNumber(t))),
    [affirmations],
  );

  const handleChange = (idx: number, value: string) => {
    const next = drafts.map((d, i) => (i === idx ? value.slice(0, AFFIRMATION_INPUT_MAX) : d));
    setDrafts(next);
    if (mismatched.has(idx)) {
      const m = new Set(mismatched);
      if (normalizeForCompare(stripLeadingNumber(value)) === targetNorm[idx]) m.delete(idx);
      setMismatched(m);
    }
    // 다시 타이핑을 시작하면 라이브 안내는 일단 숨겼다가 blur 시점에 재평가한다.
    if (blurred.has(idx)) {
      const b = new Set(blurred);
      b.delete(idx);
      setBlurred(b);
    }
    if (errorMsg) setErrorMsg(null);
  };

  const handleBlur = (idx: number) => {
    if (alreadyCheckedIn) return;
    if ((drafts[idx] ?? "").trim().length === 0) return;
    if (blurred.has(idx)) return;
    const b = new Set(blurred);
    b.add(idx);
    setBlurred(b);
  };

  const handleSubmit = async () => {
    if (submitting) return;
    if (!allFilled) {
      setErrorMsg(t("motivation.affirmations.mismatched"));
      return;
    }
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const res = await onSubmit(drafts);
      if (res.matched) {
        setFlash(t("motivation.affirmations.matched", { count: res.streakCount }));
        setMismatched(new Set());
      } else {
        const idxs = new Set(res.mismatchedIndices ?? []);
        setMismatched(idxs);
        setErrorMsg(t("motivation.affirmations.mismatched"));
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (affirmations.length === 0) return null;

  const labelColor = tone === "dark" ? "text-white/65" : "text-black/55";
  const titleColor = tone === "dark" ? "text-white" : "text-[#1E1B4B]";
  const counterColor = tone === "dark" ? "text-white/65" : "text-black/55";
  const inputBase =
    tone === "dark"
      ? "border-white/20 bg-white/15 text-white placeholder:text-white/45 focus:border-white/55"
      : "border-black/10 bg-white text-[#1E1B4B] placeholder:text-black/40 focus:border-[#1E1B4B]";
  const inputLocked =
    tone === "dark"
      ? "border-white/15 bg-white/8 text-white/80"
      : "border-black/8 bg-white/70 text-[#1E1B4B]/85";
  const inputErr =
    tone === "dark"
      ? "border-rose-300/80 bg-white/15 text-white placeholder:text-white/45"
      : "border-rose-500/70 bg-white text-[#1E1B4B] placeholder:text-black/40";

  return (
    <div
      className={`mt-6 rounded-[14px] px-4 py-3.5 ${
        tone === "dark" ? "bg-white/10" : "bg-black/[0.04]"
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <p className={`text-[11px] font-semibold uppercase tracking-[0.08em] ${labelColor}`}>
          {t("motivation.affirmations.title")}
        </p>
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-[-0.005em] ${
            tone === "dark" ? "bg-white/15 text-white/95" : "bg-[#1E1B4B]/10 text-[#1E1B4B]"
          }`}
        >
          🔥 {t("motivation.affirmations.streak", { count: streakCount })}
        </span>
      </div>
      <p className={`mt-2 text-[13.5px] leading-[1.45] tracking-[-0.015em] ${titleColor}`}>
        {alreadyCheckedIn
          ? t("motivation.affirmations.alreadyToday")
          : t("motivation.affirmations.placeholder")}
      </p>

      <ul className="mt-3 space-y-2">
        {affirmations.map((target, idx) => {
          const draft = drafts[idx] ?? "";
          const lockedNow = alreadyCheckedIn;
          // 1) 라이브 mismatch 는 blur 후에만 노출 — 타이핑 도중엔 잔소리 안 함.
          const draftNorm = normalizeForCompare(stripLeadingNumber(draft));
          const liveErr =
            !lockedNow &&
            blurred.has(idx) &&
            draft.trim().length > 0 &&
            draftNorm !== targetNorm[idx];
          // 2) 제출 후 서버가 mismatched 로 표시한 줄 — 빨간 테두리 강조.
          const submittedErr = mismatched.has(idx);
          const showHint = !lockedNow && (liveErr || submittedErr);
          const inputCls = lockedNow ? inputLocked : submittedErr ? inputErr : inputBase;
          // 입력 표시값 — 잠금 시엔 정답 텍스트가 보이고, 평소엔 사용자 입력 그대로.
          const displayDraft = lockedNow ? target : draft;
          return (
            <li key={idx} className="flex items-center gap-2">
              <span
                aria-hidden
                className={`shrink-0 select-none text-[13px] font-semibold tabular-nums tracking-[-0.005em] ${
                  tone === "dark" ? "text-white/70" : "text-[#1E1B4B]/65"
                }`}
                style={{ minWidth: "1.6rem", textAlign: "right" }}
              >
                {idx + 1}.
              </span>
              <div className="min-w-0 flex-1">
                <input
                  value={displayDraft}
                  readOnly={lockedNow}
                  disabled={submitting && !lockedNow}
                  placeholder={target}
                  maxLength={AFFIRMATION_INPUT_MAX}
                  onChange={(e) => handleChange(idx, e.target.value)}
                  onBlur={() => handleBlur(idx)}
                  aria-label={`${idx + 1}번 다짐 — ${target}`}
                  aria-invalid={showHint || undefined}
                  className={`w-full rounded-[10px] border px-3 py-2 text-[13.5px] leading-[1.4] tracking-[-0.01em] focus:outline-none ${inputCls}`}
                />
                <div
                  className={`mt-0.5 flex items-start gap-2 text-[10.5px] tabular-nums ${counterColor}`}
                >
                  {showHint ? (
                    <span
                      className={`min-w-0 flex-1 break-words ${
                        tone === "dark" ? "text-rose-100/95" : "text-rose-700"
                      }`}
                    >
                      → {target}
                    </span>
                  ) : (
                    <span className="flex-1" />
                  )}
                  <span className="shrink-0">
                    {displayDraft.length}/{AFFIRMATION_INPUT_MAX}
                  </span>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {!alreadyCheckedIn && (
        <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || !allFilled}
            className={`rounded-pill px-3.5 py-1.5 text-[11px] font-semibold tracking-[-0.005em] transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
              tone === "dark"
                ? "bg-white text-[#1E1B4B] hover:bg-white/90"
                : "bg-[#1E1B4B] text-white hover:bg-[#2A2766]"
            }`}
          >
            {submitting ? t("motivation.affirmations.checkingIn") : t("motivation.affirmations.checkin")}
          </button>
        </div>
      )}

      {errorMsg && (
        <p
          className={`mt-2 text-[11px] tracking-[-0.005em] ${
            tone === "dark" ? "text-rose-100/95" : "text-rose-700"
          }`}
        >
          {errorMsg}
        </p>
      )}
      {flash && (
        <p
          role="status"
          className={`mt-2 text-[12px] font-semibold tracking-[-0.005em] ${
            tone === "dark" ? "text-white" : "text-[#1E1B4B]"
          }`}
        >
          {flash}
        </p>
      )}
    </div>
  );
}
