"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import NewChatModal from "@/components/chat/NewChatModal";

export default function ChatPage() {
  const router = useRouter();
  const { user, firebaseUser, loading } = useAuth();
  const [showModal, setShowModal] = useState(true);

  useEffect(() => {
    if (!loading && !firebaseUser) {
      router.push("/login");
    }
  }, [firebaseUser, loading, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600" />
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
