"use client";

import Link from "next/link";
import { useT } from "@/lib/i18n";

export default function CoachHomeCard() {
  const t = useT();
  return (
    <Link
      href="/coach"
      className="mx-4 mt-3 flex items-center gap-3 rounded-2xl bg-[var(--soul)] p-4 text-white! transition-opacity active:opacity-85"
    >
      <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/15">
        <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 11.5a6.5 6.5 0 0 1-6.5 6.5H6l-3 3v-9.5A6.5 6.5 0 0 1 9.5 5h4a6.5 6.5 0 0 1 6.5 6.5Z" />
          <path d="M8 11.5h.01m3.5 0h.01m3.5 0h.01" strokeWidth="2.3" />
        </svg>
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">{t("coach.chat.title")}</span>
          <span className="rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-semibold tracking-wide">PRO</span>
        </span>
        <span className="mt-1 block text-[13px] leading-snug text-white/85">{t("coach.home.description")}</span>
      </span>
      <svg aria-hidden="true" className="shrink-0" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="m9 5 7 7-7 7" />
      </svg>
    </Link>
  );
}
