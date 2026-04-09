"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { createSession } from "@/lib/firebase";

export default function ChatPage() {
  const router = useRouter();
  const { user, firebaseUser, loading } = useAuth();
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (loading) return;

    if (!firebaseUser) {
      router.push("/login");
      return;
    }

    // 새 세션 생성 후 리다이렉트
    if (!creating) {
      setCreating(true);
      const displayName = user?.displayName || firebaseUser.displayName || "사용자";
      createSession(firebaseUser.uid, "새 대화", displayName).then((sessionId) => {
        router.push(`/chat/${sessionId}`);
      });
    }
  }, [firebaseUser, loading, router, creating]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center text-gray-400">
        <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600" />
        <p>새 대화를 시작하는 중...</p>
      </div>
    </div>
  );
}
