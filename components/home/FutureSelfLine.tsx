"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n";

/* ─────────────────────────────────────────────────────────────────
 * FutureSelfLine — "미래의 나"를 한 줄로.
 *
 * 홈에서 미래 서술은 매일 다시 읽을 앵커지 편집 대상이 아니다. 기본은 한 줄만
 * 보여주고, 더 보고 싶은 사람만 탭해서 전문을 펼친다(수정은 설정에서).
 *
 * futurePersona 는 "· 일상: …" 형태의 태그 줄로 합성돼 있어(lib/futureSelf), 요약에는
 * 첫 줄의 태그 접두사를 떼고 본문만 쓴다 — 사용자에게 내부 태그를 보여주지 않는다.
 * ───────────────────────────────────────────────────────────────── */

/** "· 태그: 본문" → "본문". 태그가 없으면 원문 그대로. */
function stripDimensionTag(line: string): string {
  return line.replace(/^\s*·\s*[^:：]{1,12}[:：]\s*/, "").trim();
}

function summarize(text: string): string {
  const firstLine = text
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  return firstLine ? stripDimensionTag(firstLine) : "";
}

function readable(text: string): string {
  return text
    .split("\n")
    .map((l) => stripDimensionTag(l.trim()))
    .filter((l) => l.length > 0)
    .join("\n");
}

export default function FutureSelfLine({
  text,
  onWrite,
}: {
  /** User.futurePersona 원문 (빈 문자열이면 CTA 만 보여준다). */
  text: string;
  onWrite: () => void;
}) {
  const t = useT();
  const [expanded, setExpanded] = useState(false);

  const trimmed = text.trim();
  const summary = summarize(trimmed);
  const full = readable(trimmed);
  const hasMore = full.length > summary.length;

  if (summary.length === 0) {
    return (
      <button
        type="button"
        onClick={onWrite}
        className="w-full bg-[var(--bg-grouped-2)] rounded-[12px] px-5 py-4 text-left"
      >
        <span className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--label-3)]">
          {t("home.futureLine.label")}
        </span>
        <span className="mt-1.5 block text-[15px] leading-[20px] tracking-[-0.24px] text-[var(--label-2)]">
          {t("home.futureLine.empty")}
        </span>
        <span className="mt-1 block text-[15px] font-medium text-[var(--soul)]">
          {t("home.futureLine.write")} ›
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => hasMore && setExpanded((v) => !v)}
      aria-expanded={hasMore ? expanded : undefined}
      aria-label={
        hasMore
          ? expanded
            ? t("home.section.collapseAria")
            : t("home.section.expandAria")
          : undefined
      }
      className="w-full bg-[var(--bg-grouped-2)] rounded-[12px] px-5 py-4 text-left"
    >
      <span className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--label-3)]">
        {t("home.futureLine.label")}
      </span>
      <span
        className={`mt-1.5 block whitespace-pre-wrap text-[15px] leading-[21px] tracking-[-0.24px] text-[var(--label)] ${
          expanded ? "" : "line-clamp-2"
        }`}
      >
        {expanded ? full : summary}
      </span>
    </button>
  );
}
