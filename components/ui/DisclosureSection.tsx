"use client";

import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n";

/* ─────────────────────────────────────────────────────────────
 * DisclosureSection — GroupedSection 과 같은 인셋 카드지만 헤더를 눌러 접고 펼친다.
 *
 * 홈의 "선택 입력"(실행·기록)을 기본 접힘으로 내려, 진입 시 보이는 입력칸을
 * 하루 필수치 1개로 줄이는 것이 목적이다 — 선택지가 많으면 필수 행동조차 밀린다
 * (choice overload). 접힌 상태에서도 요약(summary)으로 안에 무엇이 있는지 보여준다.
 *
 * GroupedSection 은 home/settings/progress 3개 화면이 공유하므로 건드리지 않고
 * 스타일만 같게 맞춘 별도 컴포넌트로 둔다.
 *
 * 열림 상태는 localStorage 에 남겨 다음 진입에서도 사용자의 선택을 지킨다
 * (RecommitCard 와 동일한 try-catch 접근 — 사파리 시크릿 등 접근 불가 환경 방어).
 * ───────────────────────────────────────────────────────────── */

const STORAGE_KEY_PREFIX = "anima.disclosure.";

function readOpen(id: string, fallback: boolean): boolean {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_PREFIX + id);
    return raw === null ? fallback : raw === "1";
  } catch {
    return fallback;
  }
}

function writeOpen(id: string, open: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_KEY_PREFIX + id, open ? "1" : "0");
  } catch {
    /* localStorage 불가 환경 — 이번 세션 동안만 상태 유지 */
  }
}

export default function DisclosureSection({
  id,
  header,
  summary,
  footer,
  defaultOpen = false,
  children,
}: {
  /** localStorage 키에 쓰이는 안정된 식별자 (예: "home.today"). */
  id: string;
  header: string;
  /** 접혀 있을 때 헤더 우측에 보여줄 한 줄 요약 — 열면 사라진다. */
  summary?: string;
  footer?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const t = useT();
  // SSR/최초 렌더는 defaultOpen 으로 그린 뒤 마운트 후 저장값을 반영한다
  // (localStorage 를 초기 state 로 읽으면 hydration mismatch 가 난다).
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    setOpen(readOpen(id, defaultOpen));
  }, [id, defaultOpen]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    writeOpen(id, next);
  };

  return (
    <div className="mt-7">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-label={open ? t("home.section.collapseAria") : t("home.section.expandAria")}
        className="flex w-full items-center gap-2 px-7 mb-1.5 text-left"
      >
        <svg
          width="9"
          height="14"
          viewBox="0 0 8 14"
          fill="none"
          aria-hidden
          className="flex-shrink-0 transition-transform duration-200"
          style={{ transform: open ? "rotate(90deg)" : "none" }}
        >
          <path
            d="M1 1l6 6-6 6"
            stroke="var(--label-2)"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span className="text-[13px] uppercase tracking-[-0.08px] text-[var(--label-2)]">
          {header}
        </span>
        {!open && summary && (
          <span className="ml-auto text-[13px] tracking-[-0.08px] text-[var(--label-3)] truncate">
            {summary}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="mx-4 bg-[var(--bg-grouped-2)] rounded-[12px] overflow-hidden">
            {children}
          </div>
          {footer && (
            <p className="px-7 mt-1.5 text-[13px] tracking-[-0.08px] text-[var(--label-2)]">
              {footer}
            </p>
          )}
        </>
      )}
    </div>
  );
}
