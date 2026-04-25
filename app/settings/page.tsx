"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import {
  updateUserPersona,
  updateFuturePersona,
  ensureFutureSelfSession,
} from "@/lib/firebase";
import { useDailyRitual } from "@/hooks/useDailyRitual";
import UserPersonaModal from "@/components/chat/UserPersonaModal";
import FuturePersonaModal from "@/components/chat/FuturePersonaModal";
import DailyRitualSettings from "@/components/chat/DailyRitualSettings";
import { LABELS } from "@/lib/labels";

type PanelKey = "userPersona" | "futurePersona" | "dailyRitual" | null;

/**
 * 통합 설정 페이지.
 *
 * 디자인 결정:
 * - 탭 대신 카드 런처 방식 — 모바일 친화적이고, 기존 Modal 재사용으로 작업량 최소.
 * - 예약 브리핑·참고 문서는 "페르소나별" 설정이라 자문단 페이지의 카드 hover UI 그대로 유지.
 *   (설정 페이지에서는 "자문단 관리" 카드로 자문단 페이지 링크만 제공)
 * - 데일리 리추얼은 future-self 세션 id 가 필요해서 ensureFutureSelfSession 으로 사전 확보.
 */
export default function SettingsPage() {
  const router = useRouter();
  const { user, firebaseUser, loading: authLoading, signOut, refreshUser } = useAuth();
  const [futureSelfId, setFutureSelfId] = useState<string | null>(null);
  const [panel, setPanel] = useState<PanelKey>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!firebaseUser) {
      router.replace("/login");
      return;
    }
    const displayName = user?.displayName || firebaseUser.displayName || "사용자";
    ensureFutureSelfSession(firebaseUser.uid, displayName)
      .then((id) => setFutureSelfId(id))
      .catch(() => {});
  }, [authLoading, firebaseUser, user?.displayName, router]);

  const { config: dailyRitualConfig, updateConfig: updateDailyRitualConfig } =
    useDailyRitual(firebaseUser?.uid, futureSelfId || undefined, {
      userPersona: user?.userPersona,
      futurePersona: user?.futurePersona,
      userMemory: user?.userMemory,
    });

  if (authLoading || !firebaseUser) {
    return (
      <div className="flex h-full items-center justify-center bg-[#F0EDE6]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-black/10 border-t-[#1E1B4B]" />
      </div>
    );
  }

  const userPersona = user?.userPersona || "";
  const futurePersona = user?.futurePersona || "";

  // 현재 상태 요약 텍스트 (카드에 미리보기로 노출)
  const summarize = (s: string, max = 60) => {
    if (!s) return null;
    return s.length > max ? s.slice(0, max) + "…" : s;
  };

  return (
    <div className="flex h-full flex-col bg-[#F0EDE6]">
      {/* 헤더 */}
      <header className="border-b border-black/[0.06] bg-white px-5 py-5 sm:px-6 sm:py-7">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4">
          <div>
            <h1 className="text-[28px] font-semibold leading-[1.14] tracking-[-0.005em] text-[#1E1B4B] sm:text-[32px]">
              {LABELS.settings}
            </h1>
            <p className="mt-2 text-[15px] leading-[1.47] tracking-[-0.022em] text-black/60">
              {LABELS.settingsHint}
            </p>
          </div>
          <button
            type="button"
            onClick={() => router.back()}
            className="shrink-0 rounded-pill bg-[#F0EDE6] px-4 py-2 text-[13px] font-medium text-black/70 transition-colors hover:bg-black/[0.06]"
          >
            닫기
          </button>
        </div>
      </header>

      {/* 카드 목록 */}
      <div className="flex-1 overflow-y-auto px-5 py-8 pb-24 sm:px-6 lg:pb-8">
        <div className="mx-auto max-w-3xl space-y-3">
          {/* 현재의 나 */}
          <button
            type="button"
            onClick={() => setPanel("userPersona")}
            className="flex w-full items-start gap-4 rounded-[18px] bg-white p-5 text-left transition-all hover:shadow-apple"
          >
            <span className="text-[26px] leading-none">🙂</span>
            <div className="min-w-0 flex-1">
              <p className="text-[16px] font-semibold tracking-[-0.022em] text-[#1E1B4B]">
                {LABELS.currentSelf}
              </p>
              <p className="mt-0.5 text-[13px] leading-[1.4] tracking-[-0.01em] text-black/56">
                {summarize(userPersona) || LABELS.currentSelfHint}
              </p>
            </div>
            <span className="mt-1 shrink-0 text-[14px] font-medium text-[#1E1B4B]">
              {LABELS.edit} ›
            </span>
          </button>

          {/* 미래의 나 */}
          <button
            type="button"
            onClick={() => setPanel("futurePersona")}
            className="flex w-full items-start gap-4 rounded-[18px] bg-white p-5 text-left transition-all hover:shadow-apple"
          >
            <span className="text-[26px] leading-none">🌟</span>
            <div className="min-w-0 flex-1">
              <p className="text-[16px] font-semibold tracking-[-0.022em] text-[#1E1B4B]">
                {LABELS.futureSelf}
              </p>
              <p className="mt-0.5 line-clamp-2 text-[13px] leading-[1.4] tracking-[-0.01em] text-black/56">
                {summarize(futurePersona, 100) || LABELS.futureSelfHint}
              </p>
            </div>
            <span className="mt-1 shrink-0 text-[14px] font-medium text-[#1E1B4B]">
              {LABELS.edit} ›
            </span>
          </button>

          {/* 데일리 리추얼 */}
          <button
            type="button"
            onClick={() => setPanel("dailyRitual")}
            disabled={!futureSelfId}
            className="flex w-full items-start gap-4 rounded-[18px] bg-white p-5 text-left transition-all hover:shadow-apple disabled:opacity-60"
          >
            <span className="text-[26px] leading-none">☀️</span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="text-[16px] font-semibold tracking-[-0.022em] text-[#1E1B4B]">
                  {LABELS.dailyRitual}
                </p>
                {dailyRitualConfig?.enabled && (
                  <span className="rounded-pill bg-[#1E1B4B]/10 px-2 py-0.5 text-[10px] font-semibold tracking-[0.04em] text-[#1E1B4B]">
                    ON
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-[13px] leading-[1.4] tracking-[-0.01em] text-black/56">
                {dailyRitualConfig?.enabled
                  ? `매일 ${dailyRitualConfig.morningEnabled ? dailyRitualConfig.morningTime : "—"} · ${dailyRitualConfig.eveningEnabled ? dailyRitualConfig.eveningTime : "—"}`
                  : LABELS.dailyRitualHint}
              </p>
            </div>
            <span className="mt-1 shrink-0 text-[14px] font-medium text-[#1E1B4B]">
              {LABELS.edit} ›
            </span>
          </button>

          {/* 자문단 관리 — 자문단 페이지로 이동 (예약 브리핑·참고 문서는 거기서 편집) */}
          <button
            type="button"
            onClick={() => router.push("/chat/advisors")}
            className="flex w-full items-start gap-4 rounded-[18px] bg-white p-5 text-left transition-all hover:shadow-apple"
          >
            <span className="text-[26px] leading-none">🧭</span>
            <div className="min-w-0 flex-1">
              <p className="text-[16px] font-semibold tracking-[-0.022em] text-[#1E1B4B]">
                자문단 관리
              </p>
              <p className="mt-0.5 text-[13px] leading-[1.4] tracking-[-0.01em] text-black/56">
                빌트인 자문단 편집, 내 멘토 만들기, 자문단별 예약 뉴스·참고 문서
              </p>
            </div>
            <span className="mt-1 shrink-0 text-[14px] font-medium text-[#1E1B4B]">
              열기 ›
            </span>
          </button>

          {/* 계정 */}
          <div className="mt-6 rounded-[18px] bg-white p-5">
            <h2 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-black/48">
              계정
            </h2>
            <div className="mt-3 flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-medium tracking-[-0.022em] text-[#1E1B4B]">
                  {user?.displayName || "—"}
                </p>
                <p className="truncate text-[12px] tracking-[-0.01em] text-black/56">
                  {user?.email || firebaseUser.email || "—"}
                </p>
              </div>
              <button
                type="button"
                onClick={async () => {
                  await signOut();
                  router.push("/login");
                }}
                className="shrink-0 rounded-pill border border-black/10 px-4 py-2 text-[13px] font-medium text-black/70 transition-colors hover:bg-black/[0.04]"
              >
                로그아웃
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 모달들 — 기존 컴포넌트 그대로 재사용 */}
      {panel === "userPersona" && (
        <UserPersonaModal
          currentPersona={userPersona}
          onSave={async (persona) => {
            await updateUserPersona(firebaseUser.uid, persona);
            await refreshUser().catch(() => {});
          }}
          onClose={() => setPanel(null)}
        />
      )}
      {panel === "futurePersona" && (
        <FuturePersonaModal
          currentFuturePersona={futurePersona}
          onSave={async (persona) => {
            await updateFuturePersona(firebaseUser.uid, persona);
            await refreshUser().catch(() => {});
          }}
          onClose={() => setPanel(null)}
        />
      )}
      {panel === "dailyRitual" && (
        <DailyRitualSettings
          config={dailyRitualConfig}
          onUpdate={updateDailyRitualConfig}
          onClose={() => setPanel(null)}
        />
      )}
    </div>
  );
}
