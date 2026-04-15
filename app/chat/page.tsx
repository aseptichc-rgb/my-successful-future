"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { ensureFutureSelfSession } from "@/lib/firebase";
import HomeDashboard from "@/components/home/HomeDashboard";

export default function ChatPage() {
  const router = useRouter();
  const { user, firebaseUser, loading } = useAuth();
  const [futureSelfId, setFutureSelfId] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;

    if (!firebaseUser) {
      router.push("/login");
      return;
    }

    const displayName = user?.displayName || firebaseUser.displayName || "사용자";

    // future-self 세션 id만 확보(없으면 생성). 자동 redirect는 더 이상 하지 않음.
    ensureFutureSelfSession(firebaseUser.uid, displayName)
      .then((id) => setFutureSelfId(id))
      .catch((err) => {
        console.warn("미래의 나 세션 준비 실패:", err);
      });
  }, [firebaseUser, loading, router, user?.displayName]);

  if (loading || !firebaseUser) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center text-gray-400">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600" />
          <p>불러오는 중...</p>
        </div>
      </div>
    );
  }

  const displayName = user?.displayName || firebaseUser.displayName || "사용자";

  return (
    <HomeDashboard
      uid={firebaseUser.uid}
      displayName={displayName}
      futureSelfId={futureSelfId}
    />
  );
}
