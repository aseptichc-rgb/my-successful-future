"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useT, type DictKey } from "@/lib/i18n";

/* ─────────────────────────────────────────────────────────────────
 * TabBar — 하단 고정 탭 4개: 오늘 · 기록 · 성장 · 내 꿈.
 *
 *  · 탭 이동은 replace — Android(TWA) 뒤로가기가 탭 히스토리를 되감지 않고 앱을 나간다
 *    (네이티브 탭 바 관례). 설정·기록 히스토리 같은 하위 페이지만 push 로 쌓인다.
 *  · 활성 탭을 다시 누르면 맨 위로 — 하위 경로(/record/history)도 부모 탭이 켜진다.
 *  · 텍스트 입력에 포커스가 있는 동안 숨긴다 — iOS 웹뷰에서 fixed 하단 바가 키보드 위로
 *    튀어 입력칸을 가리는 것을 막는다(기록 탭 입력칸).
 *  · z-40: 시트(components/ui/Sheet, z-50)가 탭 바를 덮는다.
 * ───────────────────────────────────────────────────────────────── */

export type TabHref = "/home" | "/record" | "/progress" | "/dream";

interface TabDef {
  href: TabHref;
  labelKey: DictKey;
  icon: ReactNode;
}

const ICON_SIZE = 24;
const ICON_STROKE = 1.8;

function iconProps() {
  return {
    width: ICON_SIZE,
    height: ICON_SIZE,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: ICON_STROKE,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
}

/** 오늘 — 해. */
const IconToday = (
  <svg {...iconProps()}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" />
  </svg>
);

/** 기록 — 연필이 놓인 노트. */
const IconRecord = (
  <svg {...iconProps()}>
    <path d="M5 4.5h11a1.5 1.5 0 0 1 1.5 1.5v13a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5V6A1.5 1.5 0 0 1 5 4.5z" />
    <path d="M7 9h7M7 12.5h7M7 16h4" />
    <path d="M20.5 8.5v7" />
  </svg>
);

/** 성장 — 새싹. */
const IconProgress = (
  <svg {...iconProps()}>
    <path d="M12 21v-8" />
    <path d="M12 13c0-3.5 2.5-6 6.5-6 0 3.5-2.5 6-6.5 6z" />
    <path d="M12 16c0-3-2-5-5.5-5 0 3 2 5 5.5 5z" />
    <path d="M6 21h12" />
  </svg>
);

/** 내 꿈 — 별. */
const IconDream = (
  <svg {...iconProps()}>
    <path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1.1 5.9L12 16.9l-5.3 2.8 1.1-5.9-4.3-4.1 5.9-.8L12 3.5z" />
  </svg>
);

const TABS: ReadonlyArray<TabDef> = [
  { href: "/home", labelKey: "nav.today", icon: IconToday },
  { href: "/record", labelKey: "nav.record", icon: IconRecord },
  { href: "/progress", labelKey: "nav.progress", icon: IconProgress },
  { href: "/dream", labelKey: "nav.dream", icon: IconDream },
];

/** 키보드를 올리는 입력 요소인가 — 체크박스·버튼류 input 은 제외. */
const NON_TEXT_INPUT_TYPES = new Set(["checkbox", "radio", "button", "submit", "range", "file"]);

function isTextField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.tagName === "TEXTAREA" || target.isContentEditable) return true;
  if (target.tagName !== "INPUT") return false;
  return !NON_TEXT_INPUT_TYPES.has((target as HTMLInputElement).type);
}

function useKeyboardOpen(): boolean {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onFocusIn = (e: FocusEvent) => {
      if (isTextField(e.target)) setOpen(true);
    };
    const onFocusOut = (e: FocusEvent) => {
      if (isTextField(e.target)) setOpen(false);
    };
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    return () => {
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
    };
  }, []);
  return open;
}

function isTabActive(pathname: string | null, href: TabHref): boolean {
  if (!pathname) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function TabBar() {
  const t = useT();
  const pathname = usePathname();
  const keyboardOpen = useKeyboardOpen();

  return (
    <nav
      aria-label={t("nav.aria")}
      hidden={keyboardOpen}
      className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--sep)] bg-[var(--bg-grouped-2)] safe-pb"
    >
      <div className="mx-auto flex h-[var(--tab-bar-h)] max-w-3xl">
        {TABS.map((tab) => {
          const active = isTabActive(pathname, tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              replace
              aria-current={active ? "page" : undefined}
              onClick={(e) => {
                if (!active) return;
                // 이미 그 탭이면 이동 대신 맨 위로 — 네이티브 탭 바 관례.
                e.preventDefault();
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              className={`flex min-h-[44px] flex-1 flex-col items-center justify-center gap-0.5 transition-opacity active:opacity-60 ${
                active ? "text-[var(--soul)]" : "text-[var(--label-3)]"
              }`}
            >
              {tab.icon}
              <span className="text-[10px] font-medium leading-[12px] tracking-[-0.08px]">
                {t(tab.labelKey)}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
