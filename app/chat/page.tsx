"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { ensureFutureSelfSession } from "@/lib/firebase";

export default function ChatPage() {
  const router = useRouter();
  const { user, firebaseUser, loading } = useAuth();

  useEffect(() => {
    if (loading) return;

    if (!firebaseUser) {
      router.push("/login");
      return;
    }

    // 온보딩 미완료 사용자는 위저드로. user 프로필이 아직 로드 중일 수 있으니
    // user 객체가 있는데 onboardedAt 이 없을 때만 분기 (null/undefined 혼동 방지).
    if (user && !user.onboardedAt) {
      router.replace("/onboarding");
      return;
    }

    // future-self 세션은 백그라운드로 준비만 해두고, 진입 화면은 채팅 인박스로 통일.
    const displayName = user?.displayName || firebaseUser.displayName || "사용자";
    ensureFutureSelfSession(firebaseUser.uid, displayName).catch((err) => {
      console.warn("미래의 나 세션 준비 실패:", err);
    });

    router.replace("/chat/inbox");
  }, [firebaseUser, loading, router, user, user?.displayName]);

  return (
    <div className="flex h-full items-center justify-center bg-[#F0EDE6]">
      <div className="text-center">
        <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-black/10 border-t-[#1E1B4B]" />
        <p className="text-[14px] tracking-[-0.022em] text-black/48">불러오는 중…</p>
      </div>
    </div>
  );
}
