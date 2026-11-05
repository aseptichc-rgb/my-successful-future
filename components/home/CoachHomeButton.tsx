"use client";

import Link from "next/link";
import { useT } from "@/lib/i18n";

export default function CoachHomeButton() {
  const t = useT();
  const label = t("coach.chat.title");
  return (
    <Link
      href="/coach"
      aria-label={label}
      title={label}
      className="pointer-events-auto grid size-[52px] place-content-center justify-items-center gap-0.5 rounded-full border border-[var(--sep)] bg-[var(--soul-soft)] text-[var(--soul)]! shadow-[0_2px_10px_rgba(30,27,75,0.13)] transition-colors active:bg-[var(--bg-grouped-2)]"
    >
      <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 11a7 7 0 0 1-7 7H8l-5 3V11a7 7 0 0 1 7-7h4a7 7 0 0 1 7 7Z" />
        <path d="M8.5 11h.01m3.5 0h.01m3.5 0h.01" strokeWidth="2.2" />
      </svg>
      <span aria-hidden="true" className="text-[10px] font-semibold leading-none tracking-wide">AI</span>
    </Link>
  );
}
