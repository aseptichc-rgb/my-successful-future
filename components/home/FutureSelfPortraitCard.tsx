"use client";

import { useState } from "react";
import type { FutureSelfPortrait } from "@/types";
import { useLanguage } from "@/lib/i18n";

/* ─────────────────────────────────────────────────────────────────
 * FutureSelfPortraitCard — "10년 후 나의 모습" 초상 카드.
 *  · 온보딩 몰입형 답변을 종합해 생성된 2인칭 고정 초상(정체성 앵커)을 표시
 *  · 미래 비전(1인칭·매일 회전 '어느 하루')과 달리 답변이 바뀔 때만 다시 그려진다
 *  · 저장된 초상이 없으면(레거시/미작성) 부모가 렌더 자체를 생략 — 빈 카드 없음
 * ───────────────────────────────────────────────────────────────── */

interface FutureSelfPortraitCardProps {
  portrait: FutureSelfPortrait;
}

export default function FutureSelfPortraitCard({ portrait }: FutureSelfPortraitCardProps) {
  const { t } = useLanguage();
  // 점진적 공개: 기본은 제목까지만 → 탭하면 본문·하이라이트가 펼쳐진다(비전 카드와 동일 감각).
  const [expanded, setExpanded] = useState(false);

  return (
    <section className="flex flex-col gap-4" aria-label={t("futureSelf.portrait.headerLabel")}>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="relative w-full overflow-hidden rounded-[18px] text-left"
        style={{
          background: "linear-gradient(135deg, #1E1B4B 0%, #2A2766 100%)",
          boxShadow: "var(--shadow-card)",
        }}
      >
        <div className="px-5 py-6">
          <div className="text-[11px] font-semibold tracking-[1.6px] uppercase text-white/50">
            {t("futureSelf.portrait.headerLabel")}
          </div>
          <h3 className="mt-2.5 text-[19px] font-bold leading-[1.35] tracking-[-0.4px] text-white">
            {portrait.title}
          </h3>

          {expanded && (
            <>
              <p className="mt-3 whitespace-pre-wrap text-[15px] leading-[1.65] tracking-[-0.24px] text-white/85">
                {portrait.portrait}
              </p>
              {portrait.highlights && portrait.highlights.length > 0 && (
                <ul className="mt-4 space-y-1.5">
                  {portrait.highlights.map((h, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-2 text-[13px] leading-[1.5] tracking-[-0.08px] text-white/70"
                    >
                      <span aria-hidden className="mt-[1px] text-white/45">·</span>
                      {h}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}

          {/* 펼침 힌트 chevron — 접힘/펼침 상태를 시각적으로 안내 */}
          <div className="mt-3 flex justify-center">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="rgba(255,255,255,0.45)"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
              style={{
                transform: expanded ? "rotate(180deg)" : "none",
                transition: "transform 0.2s ease",
              }}
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </div>
        </div>
      </button>
    </section>
  );
}
