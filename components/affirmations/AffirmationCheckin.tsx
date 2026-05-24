"use client";

import { useEffect, useMemo, useState } from "react";
import { useT } from "@/lib/i18n";

/* ─────────────────────────────────────────────────────────────────
 * AffirmationCheckin — Apple iOS native redesign
 *  · Grouped inset card (white on systemGroupedBackground)
 *  · Per-row colored number badges — iOS palette
 *  · Underline-only inputs · matched ✓ Green
 *  · Streak chip — Orange (위젯과 통일)
 * ───────────────────────────────────────────────────────────────── */

const AFFIRMATION_INPUT_MAX = 72;

// 번호 배지는 단일 indigo 톤으로 통일 — 차분한 인상을 위해 무지개 색 분산을 없앤다.
const ROW_COLORS = ["#1E1B4B", "#1E1B4B", "#1E1B4B", "#1E1B4B", "#1E1B4B"];

function normalizeForCompare(s: string): string {
  return s.trim().replace(/\s+/g, " ").slice(0, AFFIRMATION_INPUT_MAX);
}
function stripLeadingNumber(s: string): string {
  return s.replace(/^\s*\d+\s*[.)\]]\s*/, "");
}

export default function AffirmationCheckin({
  affirmations,
  tone: _tone,
  streakCount,
  alreadyCheckedIn,
  onSubmit,
}: {
  affirmations: string[];
  tone: "dark" | "light";
  streakCount: number;
  alreadyCheckedIn: boolean;
  onSubmit: (
    texts: string[],
  ) => Promise<{ matched: boolean; streakCount: number; mismatchedIndices?: number[] }>;
}) {
  const t = useT();
  const [drafts, setDrafts] = useState<string[]>(() => affirmations.map(() => ""));
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [mismatched, setMismatched] = useState<Set<number>>(() => new Set());
  const [blurred, setBlurred] = useState<Set<number>>(() => new Set());
  const [flash, setFlash] = useState<string | null>(null);

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

  const targetNorm = useMemo(
    () => affirmations.map((tt) => normalizeForCompare(stripLeadingNumber(tt))),
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

  return (
    <div className="bg-[var(--bg-grouped-2)] rounded-[12px] overflow-hidden">
      {/* Card header — Title + streak chip */}
      <div className="flex items-center justify-between px-5 pt-4 pb-2">
        <span className="text-[17px] font-semibold tracking-[-0.43px] text-[var(--label)]">
          {t("motivation.affirmations.title")}
        </span>
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

      <p className="px-5 pb-3 text-[13px] leading-[18px] tracking-[-0.08px] text-[var(--label-2)]">
        {alreadyCheckedIn
          ? t("motivation.affirmations.alreadyToday")
          : t("motivation.affirmations.placeholder")}
      </p>

      {/* Rows */}
      <div>
        {affirmations.map((target, idx) => {
          const draft = drafts[idx] ?? "";
          const lockedNow = alreadyCheckedIn;
          const draftNorm = normalizeForCompare(stripLeadingNumber(draft));
          const liveErr =
            !lockedNow &&
            blurred.has(idx) &&
            draft.trim().length > 0 &&
            draftNorm !== targetNorm[idx];
          const submittedErr = mismatched.has(idx);
          const showHint = !lockedNow && (liveErr || submittedErr);
          const matched =
            !lockedNow && draft.trim().length > 0 && draftNorm === targetNorm[idx];
          const num = String(idx + 1).padStart(2, "0");
          const displayDraft = lockedNow ? target : draft;
          const color = ROW_COLORS[idx % ROW_COLORS.length];
          const isLast = idx === affirmations.length - 1;
          const done = lockedNow || matched;

          // Underline color: completed = color, error = red dashed, focused = blue
          const borderColor = done
            ? color
            : showHint
              ? "#FF3B30"
              : "var(--sep)";

          return (
            <div
              key={idx}
              className="relative flex items-start gap-3 px-4 py-3"
            >
              {/* Colored number badge */}
              <div
                className="w-9 h-9 rounded-[10px] flex items-center justify-center flex-shrink-0 mt-0.5"
                style={{
                  background: done ? color : color + "1F",
                }}
              >
                {done ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12l5 5L20 7" />
                  </svg>
                ) : (
                  <span
                    className="text-[15px] font-bold tracking-[-0.3px]"
                    style={{ color }}
                  >
                    {num}
                  </span>
                )}
              </div>

              <div className="flex-1 min-w-0">
                {/* Target — small gray ghost */}
                <div className="text-[13px] leading-[18px] tracking-[-0.08px] text-[var(--label-3)] mb-1">
                  {target}
                </div>

                {/* Input — underline only */}
                <input
                  value={displayDraft}
                  readOnly={lockedNow}
                  disabled={submitting && !lockedNow}
                  placeholder="따라 적어주세요…"
                  maxLength={AFFIRMATION_INPUT_MAX}
                  onChange={(e) => handleChange(idx, e.target.value)}
                  onBlur={() => handleBlur(idx)}
                  aria-label={`${idx + 1}번 다짐 — ${target}`}
                  aria-invalid={showHint || undefined}
                  className="w-full bg-transparent border-b py-1 text-[17px] leading-[22px] tracking-[-0.43px] text-[var(--label)] placeholder:text-[var(--label-3)] focus:outline-none transition-colors"
                  style={{
                    borderColor,
                    borderStyle: showHint ? "dashed" : "solid",
                    borderWidth: 1,
                  }}
                />

                {showHint && (
                  <p className="mt-1 text-[12px] tracking-[-0.08px] text-[#FF3B30]">
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

      {/* Submit footer */}
      {!alreadyCheckedIn && (
        <div className="flex items-center justify-end gap-4 px-5 py-3 border-t border-[var(--sep)]">
          {errorMsg && (
            <span className="text-[13px] text-[#FF3B30] mr-auto">{errorMsg}</span>
          )}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || !allFilled}
            className="text-[15px] font-semibold text-[var(--soul)] disabled:opacity-30"
          >
            {submitting
              ? t("motivation.affirmations.checkingIn")
              : t("motivation.affirmations.checkin")}
          </button>
        </div>
      )}

      {flash && (
        <p
          role="status"
          className="px-5 py-3 text-[13px] font-semibold text-[#D85A30] border-t border-[var(--sep)]"
        >
          ✓ {flash}
        </p>
      )}
    </div>
  );
}
