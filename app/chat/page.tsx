"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { getSessions, ensureFutureSelfSession } from "@/lib/firebase";
import NewChatModal from "@/components/chat/NewChatModal";

export default function ChatPage() {
  const router = useRouter();
  const { user, firebaseUser, loading } = useAuth();
  const [showModal, setShowModal] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (loading) return;

    if (!firebaseUser) {
      router.push("/login");
      return;
    }

    const displayName = user?.displayName || firebaseUser.displayName || "사용자";

    // 1) future-self 세션을 항상 보장 (없으면 생성)
    // 2) 다른 기존 세션이 있으면 그 중 가장 최근 대화로 이동
    // 3) 없으면 future-self 세션으로 이동
    Promise.all([
      ensureFutureSelfSession(firebaseUser.uid, displayName),
      getSessions(firebaseUser.uid),
    ])
      .then(([futureSelfId, sessions]) => {
        // future-self 외에 다른 세션이 있으면 그 중 가장 최근 대화로
        const otherSessions = sessions.filter((s) => s.sessionType !== "future-self");
        if (otherSessions.length > 0) {
          router.replace(`/chat/${otherSessions[0].id}`);
        } else {
          router.replace(`/chat/${futureSelfId}`);
        }
      })
      .catch(() => {
        setShowModal(true);
        setChecking(false);
      });
  }, [firebaseUser, loading, router, user?.displayName]);

  if (loading || checking) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center text-gray-400">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600" />
          <p>대화 불러오는 중...</p>
        </div>
      </div>
    );
  }

  if (!firebaseUser) return null;

  const displayName = user?.displayName || firebaseUser.displayName || "사용자";

  return (
    <div className="flex h-full flex-col items-center justify-center bg-white">
      <div className="text-center">
        <h2 className="mb-2 text-2xl font-bold text-gray-900">대화 시작하기</h2>
        <p className="mb-6 text-gray-500">AI 채팅, DM, 또는 그룹 채팅을 선택하세요</p>
        <button
          onClick={() => setShowModal(true)}
          className="rounded-xl bg-blue-600 px-6 py-3 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
        >
          새 대화 만들기
        </button>
      </div>

      {showModal && (
        <NewChatModal
          uid={firebaseUser.uid}
          displayName={displayName}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}
