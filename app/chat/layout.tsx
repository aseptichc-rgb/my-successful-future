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
    <div className="flex h-screen overflow-hidden">
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
            className="fixed bottom-20 right-2 left-2 z-50 max-w-xs mx-auto cursor-pointer rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-lg transition-all animate-in slide-in-from-top lg:absolute lg:top-2 lg:bottom-auto lg:left-auto lg:mx-0"
          >
            <p className="text-sm font-semibold text-gray-900">{toast.title}</p>
            <p className="mt-0.5 text-xs text-gray-500 truncate">{toast.body}</p>
          </div>
        )}

        {/* 알림 권한 요청 프롬프트 */}
        {showNotifPrompt && (
          <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 flex max-w-[calc(100vw-1rem)] items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm shadow-lg lg:absolute lg:top-2 lg:bottom-auto lg:px-4 lg:py-3">
            <p className="text-sm text-blue-800">새 메시지 알림을 받으시겠습니까?</p>
            <button
              onClick={handleEnableNotifications}
              className="rounded-lg bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700"
            >
              허용
            </button>
            <button
              onClick={() => setShowNotifPrompt(false)}
              className="text-xs text-blue-600 hover:text-blue-800"
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
