"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import BottomNav from "@/components/chat/BottomNav";
import { onForegroundMessage } from "@/lib/fcm";

const IconSettings = ({ className = "h-5 w-5" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.04 1.56V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.11-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06A2 2 0 1 1 4.13 16.92l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1.04H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.65 8.83a1.7 1.7 0 0 0-.34-1.87l-.06-.06A2 2 0 1 1 7.08 4.07l.06.06a1.7 1.7 0 0 0 1.87.34H9a1.7 1.7 0 0 0 1.04-1.56V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1.04 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06A2 2 0 1 1 19.93 7.08l-.06.06a1.7 1.7 0 0 0-.34 1.87V9c.27.66.93 1.1 1.65 1.1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1z" />
  </svg>
);

interface ToastNotification {
  title: string;
  body: string;
  sessionId?: string;
}

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  const { user, firebaseUser, enableNotifications } = useAuth();
  const [toast, setToast] = useState<ToastNotification | null>(null);
  const [showNotifPrompt, setShowNotifPrompt] = useState(false);
  const router = useRouter();
  const params = useParams();
  const currentSessionId = params.sessionId as string | undefined;
  // 세션방(우측 헤더에 액션이 많은 화면)에서는 우측 상단 설정 버튼이 겹치므로 숨김
  const showSettingsButton = !currentSessionId;
  const displayName = user?.displayName || firebaseUser?.displayName || "사용자";

  // 포그라운드 메시지 리스너
  useEffect(() => {
    const unsub = onForegroundMessage((payload) => {
      // 현재 보고 있는 세션의 메시지는 토스트로 표시하지 않음
      if (payload.sessionId === currentSessionId) return;
      setToast({
        title: payload.title || "새 메시지",
        body: payload.body || "",
        sessionId: payload.sessionId,
      });
      // 5초 후 자동 닫기
      setTimeout(() => setToast(null), 5000);
    });
    return unsub;
  }, [currentSessionId]);

  // 알림 권한 프롬프트 (최초 1회)
  useEffect(() => {
    if (typeof Notification !== "undefined" && Notification.permission === "default" && firebaseUser) {
      // 3초 딜레이 후 프롬프트 표시
      const timer = setTimeout(() => setShowNotifPrompt(true), 3000);
      return () => clearTimeout(timer);
    }
  }, [firebaseUser]);

  const handleEnableNotifications = useCallback(async () => {
    await enableNotifications();
    setShowNotifPrompt(false);
  }, [enableNotifications]);

  return (
    <div className="flex h-dvh overflow-hidden">
      {/* 데스크톱 좌측 슬림 레일 (BottomNav가 lg에서 슬림 레일로 렌더) */}
      {firebaseUser && (
        <BottomNav uid={firebaseUser.uid} displayName={displayName} />
      )}

      {/* 메인 콘텐츠 (모바일 바텀 탭만큼 하단 패딩 확보) */}
      <div className="flex flex-1 flex-col overflow-hidden relative pb-14 lg:pb-0">
        {/* 우측 상단 설정 버튼 — 모바일 바텀탭에서 빠진 설정 진입 경로 */}
        {firebaseUser && showSettingsButton && (
          <button
            type="button"
            onClick={() => router.push("/settings")}
            aria-label="설정"
            title="설정"
            className="fixed right-3 top-3 z-40 flex h-10 w-10 items-center justify-center rounded-full border border-black/[0.06] bg-white/90 text-[#1E1B4B] shadow-apple backdrop-blur transition-colors hover:bg-white"
          >
            <IconSettings className="h-[18px] w-[18px]" />
          </button>
        )}

        {/* 포그라운드 알림 토스트 */}
        {toast && (
          <div
            onClick={() => {
              if (toast.sessionId) router.push(`/chat/${toast.sessionId}`);
              setToast(null);
            }}
            className="fixed bottom-20 right-2 left-2 z-50 max-w-xs mx-auto cursor-pointer rounded-[14px] bg-white px-4 py-3 shadow-apple-lg transition-all animate-in slide-in-from-top lg:absolute lg:top-16 lg:right-3 lg:left-auto lg:bottom-auto lg:mx-0"
          >
            <p className="text-[14px] font-semibold tracking-[-0.022em] text-[#1E1B4B]">{toast.title}</p>
            <p className="mt-0.5 truncate text-[12px] tracking-[-0.01em] text-black/56">{toast.body}</p>
          </div>
        )}

        {/* 알림 권한 요청 프롬프트 */}
        {showNotifPrompt && (
          <div className="nav-glass fixed bottom-20 left-1/2 z-50 flex max-w-[calc(100vw-1rem)] -translate-x-1/2 items-center gap-3 rounded-pill border border-black/[0.06] px-4 py-2.5 shadow-apple lg:absolute lg:top-16 lg:bottom-auto">
            <p className="text-[13px] tracking-[-0.01em] text-[#1E1B4B]">새 메시지 알림을 받으시겠습니까?</p>
            <button
              onClick={handleEnableNotifications}
              className="rounded-pill bg-[#1E1B4B] px-3 py-1 text-[12px] font-medium text-white transition-colors hover:bg-[#2A2766]"
            >
              허용
            </button>
            <button
              onClick={() => setShowNotifPrompt(false)}
              className="text-[12px] font-medium text-black/48 transition-colors hover:text-black/80"
            >
              나중에
            </button>
          </div>
        )}

        {children}
      </div>
    </div>
  );
}
