"use client";

import { useEffect, useMemo, useState } from "react";
import { useT } from "@/lib/i18n";

/* ─────────────────────────────────────────────────────────────────
 * Anima AffirmationCheckin — v2 redesign
 * ─────────────────────────────────────────────────────────────────
 * 변경 핵심:
 *  · 회색 박스(rounded-14 bg-black/4) 제거 — cream 평면 위에 직접.
 *  · 각 다짐 행: 번호 (display italic Soul) + 목표문(italic ghost)
 *    + 입력 (border-bottom underline only). 박스 안 입력 박스 패턴 제거.
 *  · 일치 시 ✓ Soul accent, 불일치 시 dashed border-soul + 힌트.
 *  · streak: mono uppercase + Soul glow dot (위젯·페이지 헤더와 동일 형식).
 *  · 제출 버튼 → 우측 텍스트 링크.
 *  · tone(dark/light) 분기 제거 — 항상 light(cream + indigo).
 *
 * 비즈니스 로직(normalizeForCompare/stripLeadingNumber/onSubmit) 그대로.
 * ────────────────────────────────────────────────────────────────── */

/** 입력 필드 최대 길이 — 저장된 다짐(60자) + 번호 프리픽스 여유. */
const AFFIRMATION_INPUT_MAX = 72;

function normalizeForCompare(s: string): string {
  return s.trim().replace(/\s+/g, " ").slice(0, AFFIRMATION_INPUT_MAX);
}
function stripLeadingNumber(s: string): string {
  return s.replace(/^\s*\d+\s*[.)\]]\s*/, "");
}

export default function AffirmationCheckin({
  affirmations,
  tone: _tone, // ignored — 항상 cream/light
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
    <div>
      {/* ── 섹션 헤더 ── */}
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-indigo/45">
          {t("motivation.affirmations.title")}
        </span>
        <span className="flex items-center gap-1.5 font-mono text-[11px] text-indigo/60">
          <span
            className="block h-1.5 w-1.5 rounded-full bg-soul"
            style={{ boxShadow: "0 0 6px var(--soul)" }}
            aria-hidden
          />
          <span className="tracking-[0.1em]">
            {t("motivation.affirmations.streak", { count: streakCount })}
          </span>
        </span>
      </div>

      {/* ── instructional copy — ghost italic ── */}
      <p className="mt-2 font-display text-[13px] font-light italic leading-[1.5] text-indigo/55">
        {alreadyCheckedIn
          ? t("motivation.affirmations.alreadyToday")
          : t("motivation.affirmations.placeholder")}
      </p>

      {/* ── 다짐 행들 ── */}
      <ul className="mt-3">
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
          const matched = !lockedNow && draft.trim().length > 0 && draftNorm === targetNorm[idx];
          const num = String(idx + 1).padStart(2, "0");

          // 입력 표시값 — 잠금 시엔 정답 텍스트가 보이고, 평소엔 사용자 입력 그대로.
          const displayDraft = lockedNow ? target : draft;

          // border-bottom 색: 잠금=완료(soul), 에러=soul dashed, 일치=soul solid, 기본=hairline
          const borderClass = lockedNow
            ? "border-soul/60"
            : showHint
              ? "border-soul border-dashed"
              : matched
                ? "border-soul"
                : "border-hairline focus-within:border-indigo";

          return (
            <li
              key={idx}
              className="flex items-start gap-3 border-b border-hairline py-3 last:border-b-0"
            >
              <span
                aria-hidden
                className="shrink-0 select-none pt-[2px] font-display text-[22px] font-light leading-none italic text-soul"
                style={{ minWidth: "1.75rem" }}
              >
                {(lockedNow || matched) ? (
                  <svg
                    className="h-5 w-5 text-soul"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2.4}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <path d="M5 12l5 5L20 7" />
                  </svg>
                ) : (
                  num
                )}
              </span>

              <div className="min-w-0 flex-1">
                {/* target — Fraunces italic ghost */}
                <div className="font-display text-[13px] font-light italic leading-[1.5] text-indigo/40">
                  {target}
                </div>

                {/* 입력 — underline only */}
                <input
                  value={displayDraft}
                  readOnly={lockedNow}
                  disabled={submitting && !lockedNow}
                  placeholder={"따라 적어주세요…"}
                  maxLength={AFFIRMATION_INPUT_MAX}
                  onChange={(e) => handleChange(idx, e.target.value)}
                  onBlur={() => handleBlur(idx)}
                  aria-label={`${idx + 1}번 다짐 — ${target}`}
                  aria-invalid={showHint || undefined}
                  className={`mt-1 w-full border-b bg-transparent py-1 text-[14px] leading-[1.5] tracking-[-0.005em] text-indigo placeholder:font-display placeholder:font-light placeholder:italic placeholder:text-indigo/30 focus:outline-none ${borderClass}`}
                />

                {showHint && (
                  <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.08em] text-soul">
                    → {target}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {/* ── 제출 — 텍스트 링크 ── */}
      {!alreadyCheckedIn && (
        <div className="mt-3 flex items-center justify-end gap-4">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || !allFilled}
            className="font-mono text-[10px] uppercase tracking-[0.14em] text-soul transition-colors hover:text-soul-press disabled:opacity-30"
          >
            {submitting
              ? t("motivation.affirmations.checkingIn")
              : t("motivation.affirmations.checkin")}
          </button>
        </div>
      )}

      {errorMsg && (
        <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.1em] text-soul">
          {errorMsg}
        </p>
      )}
      {flash && (
        <p
          role="status"
          className="mt-2 font-mono text-[11px] uppercase tracking-[0.12em] text-indigo"
        >
          {flash}
        </p>
      )}
    </div>
  );
}
