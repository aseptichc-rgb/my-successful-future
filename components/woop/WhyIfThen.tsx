"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n";

/* ─────────────────────────────────────────────────────────────────
 * WhyIfThen — "왜 미리 정해두나요?" 접힘 설명.
 *
 * 설계 시트(ExecutionPlanSheet)와 홈의 "오늘의 if-then" 카드(DailyPlanCard)가
 * 같은 설명을 쓴다 — 문구가 두 벌이 되면 한쪽만 낡는다.
 *
 * 기본은 접힘: 시트의 목표는 3탭 저장이고 홈 카드의 목표는 오늘의 행동 확인이라,
 * 설명은 궁금한 사람만 연다. 열림 상태는 저장하지 않는다(매번 새로 뜬다).
 *
 *  · sheet  : 시트 상단의 독립 블록(자체 배경 + 아래 여백).
 *  · inline : 카드 안의 한 행 — 배경은 카드 것을 쓰고 위쪽 구분선만 그린다.
 *
 * 근거: Gollwitzer 1999 · Gollwitzer & Sheeran 2006(d=0.65) · Gilbert et al. 2009 ·
 *       Kappes & Oettingen 2011.
 * ───────────────────────────────────────────────────────────────── */

export default function WhyIfThen({
  variant = "sheet",
}: {
  variant?: "sheet" | "inline";
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const inline = variant === "inline";

  return (
    <div
      className={
        inline ? "" : "mb-3 rounded-[12px] bg-[var(--bg-grouped-2)] overflow-hidden"
      }
      style={inline ? { borderTop: "0.5px solid var(--sep)" } : undefined}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`w-full flex items-center gap-2.5 text-left ${
          inline ? "px-5 py-3" : "px-4 py-3"
        }`}
      >
        <span className={inline ? "text-[13px]" : "text-[15px]"} aria-hidden>
          🧠
        </span>
        <span
          className={`flex-1 tracking-[-0.24px] ${
            inline
              ? "text-[13px] text-[var(--label-2)]"
              : "text-[15px] font-medium text-[var(--label)]"
          }`}
        >
          {t("woop.why.toggle")}
        </span>
        <svg
          width="8"
          height="14"
          viewBox="0 0 8 14"
          fill="none"
          aria-hidden
          className="transition-transform duration-200"
          style={{ transform: open ? "rotate(90deg)" : "none" }}
        >
          <path
            d="M1 1l6 6-6 6"
            stroke="rgba(60,60,67,0.3)"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {open && (
        <div className={`space-y-2 pb-4 ${inline ? "px-5" : "px-4"}`}>
          <p className="text-[13px] leading-[19px] tracking-[-0.08px] text-[var(--label-2)]">
            {t("woop.why.p1")}
          </p>
          <p className="text-[13px] leading-[19px] tracking-[-0.08px] text-[var(--label-2)]">
            {t("woop.why.p2")}
          </p>
          <p className="text-[13px] leading-[19px] tracking-[-0.08px] text-[var(--label-2)]">
            {t("woop.why.p3")}
          </p>
          <p className="text-[13px] leading-[19px] tracking-[-0.08px] text-[var(--label-2)]">
            {t("woop.why.p4")}
          </p>
          <p className="text-[11px] leading-[16px] text-[var(--label-3)]">
            {t("woop.why.source")}
          </p>
        </div>
      )}
    </div>
  );
}
