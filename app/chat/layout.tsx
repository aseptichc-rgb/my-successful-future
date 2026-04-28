"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import BottomNav from "@/components/chat/BottomNav";
import { onForegroundMessage } from "@/lib/fcm";

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
        {/* 포그라운드 알림 토스트 */}
        {toast && (
          <div
            onClick={() => {
              if (toast.sessionId) router.push(`/chat/${toast.sessionId}`);
              setToast(null);
            }}
            className="fixed bottom-20 right-2 left-2 z-50 max-w-xs mx-auto cursor-pointer rounded-[14px] bg-white px-4 py-3 shadow-apple-lg transition-all animate-in slide-in-from-top lg:absolute lg:top-3 lg:right-3 lg:left-auto lg:bottom-auto lg:mx-0"
          >
            <p className="text-[14px] font-semibold tracking-[-0.022em] text-[#1E1B4B]">{toast.title}</p>
            <p className="mt-0.5 truncate text-[12px] tracking-[-0.01em] text-black/56">{toast.body}</p>
          </div>
        )}

        {/* 알림 권한 요청 프롬프트 */}
        {showNotifPrompt && (
          <div className="nav-glass fixed bottom-20 left-1/2 z-50 flex max-w-[calc(100vw-1rem)] -translate-x-1/2 items-center gap-3 rounded-pill border border-black/[0.06] px-4 py-2.5 shadow-apple lg:absolute lg:top-3 lg:bottom-auto">
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
