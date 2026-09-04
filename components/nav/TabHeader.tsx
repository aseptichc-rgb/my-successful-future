"use client";

import type { ReactNode } from "react";
import Logo from "@/components/ui/Logo";

/* ─────────────────────────────────────────────────────────────────
 * TabHeader — 탭 화면 공통 Large Title 헤더 (Apple iOS native 패턴).
 *
 *  [로고 (선택)]
 *  [leading ······················ trailing]   ← 44px 행 (뒤로가기 / 칩·톱니바퀴)
 *  큰 제목
 *  부제(선택)
 *
 * 홈·성장·기록 히스토리가 각자 복제해 쓰던 마크업을 한 곳으로 모았다 — safe-area 상단
 * 여백·제목 타입·간격이 어긋나지 않게. 고정(sticky)하지 않는다: Large Title 을 고정하면
 * 작은 폰에서 화면 1/3을 먹는다.
 * ───────────────────────────────────────────────────────────────── */

export default function TabHeader({
  title,
  subtitle,
  leading,
  trailing,
  showLogo = false,
}: {
  title: string;
  subtitle?: string;
  /** 44px 행 좌측 — 하위 페이지의 뒤로가기 버튼. */
  leading?: ReactNode;
  /** 44px 행 우측 — 스트릭 칩·톱니바퀴. */
  trailing?: ReactNode;
  /** 앱 진입 직후 가장 먼저 보이는 brand identity — 오늘 탭만 켠다. */
  showLogo?: boolean;
}) {
  return (
    <header className="bg-[var(--bg-grouped)] pb-2 pt-[calc(env(safe-area-inset-top)+12px)]">
      {showLogo && (
        <div className="mx-auto flex max-w-3xl items-center justify-center px-5 pt-1 pb-2">
          <Logo variant="lockup" tone="light" size={22} alt="Anima" priority />
        </div>
      )}
      <div className="mx-auto flex min-h-[44px] max-w-3xl items-center justify-between px-2">
        <div className="flex min-w-[44px] items-center">{leading}</div>
        <div className="flex items-center gap-2">{trailing}</div>
      </div>
      <div className="mx-auto max-w-3xl px-5">
        <h1 className="text-large-title font-display">{title}</h1>
        {subtitle && <p className="text-subhead mt-0.5 text-[var(--label-2)]">{subtitle}</p>}
      </div>
    </header>
  );
}
