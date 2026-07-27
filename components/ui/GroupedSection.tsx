"use client";

/* ─────────────────────────────────────────────────────────────
 * GroupedSection — iOS Settings.app's inset card pattern.
 * Header (uppercase, label2) above + footer (label2 footnote) below.
 * Card itself: white bg, 12px radius, 16px side inset.
 *
 * home/settings/progress 등 여러 화면이 공유하는 단일 정의 —
 * 과거 home·settings 에 중복 정의돼 있던 것을 승격(DRY).
 * `trailing` 은 헤더 우측 액세서리(카운트/버튼) 슬롯 — 없으면 헤더만 렌더.
 * ───────────────────────────────────────────────────────────── */
export default function GroupedSection({
  header,
  footer,
  trailing,
  children,
}: {
  header?: string;
  footer?: string;
  trailing?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-7">
      {(header || trailing) && (
        <div className="flex items-end justify-between px-7 mb-1.5">
          {header && (
            <span className="text-[13px] uppercase tracking-[-0.08px] text-[var(--label-2)]">
              {header}
            </span>
          )}
          {trailing}
        </div>
      )}
      <div className="mx-4 bg-[var(--bg-grouped-2)] rounded-[12px] overflow-hidden">
        {children}
      </div>
      {footer && (
        <p className="px-7 mt-1.5 text-[13px] tracking-[-0.08px] text-[var(--label-2)]">
          {footer}
        </p>
      )}
    </div>
  );
}
