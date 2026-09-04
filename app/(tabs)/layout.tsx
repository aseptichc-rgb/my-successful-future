"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { TodayDataProvider } from "@/lib/today-context";
import TabBar from "@/components/nav/TabBar";
import BootSplash from "@/components/ui/BootSplash";

/* ─────────────────────────────────────────────────────────────────
 * (tabs) 레이아웃 — 오늘 · 기록 · 성장 · 내 꿈 네 탭의 공통 껍데기.
 *
 *  · 인증 게이트: 로그인 전엔 BootSplash(앱 콜드 스타트가 가장 오래 머무는 화면 —
 *    스피너 대신 제품의 한 문장), 온보딩 전엔 /onboarding.
 *  · TodayDataProvider: 오늘 문서 구독·날짜·해금 판정을 탭들이 공유한다. 레이아웃은
 *    형제 라우트 이동에도 살아 있으므로 탭을 오가도 구독이 끊기지 않는다.
 *  · TabBar: 하단 고정. 설정(/settings)은 이 그룹 밖 — 탭 바 없이 push 로 들어간다.
 * ───────────────────────────────────────────────────────────────── */

export default function TabsLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { user, firebaseUser, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (!firebaseUser) {
      router.replace("/login");
      return;
    }
    if (user && !user.onboardedAt) router.replace("/onboarding");
  }, [firebaseUser, loading, router, user]);

  if (loading || !firebaseUser) {
    return <BootSplash />;
  }

  return (
    <TodayDataProvider>
      {children}
      <TabBar />
    </TodayDataProvider>
  );
}
