"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { getInviteLinkByToken, joinSessionViaLink } from "@/lib/firebase";
import type { InviteLink } from "@/types";

export default function InvitePage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;
  const { user, firebaseUser, loading: authLoading } = useAuth();

  const [inviteLink, setInviteLink] = useState<InviteLink | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "joining" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");

  // 초대 링크 정보 로드
  useEffect(() => {
    async function loadInvite() {
      try {
        const link = await getInviteLinkByToken(token);
        if (!link) {
          setErrorMsg("유효하지 않은 초대 링크입니다.");
          setStatus("error");
          return;
        }
        if (link.expiresAt.toMillis() < Date.now()) {
          setErrorMsg("만료된 초대 링크입니다.");
          setStatus("error");
          return;
        }
        setInviteLink(link);
        setStatus("ready");
      } catch {
        setErrorMsg("초대 정보를 불러오는데 실패했습니다.");
        setStatus("error");
      }
    }
    loadInvite();
  }, [token]);

  // 로그인 안 된 상태에서 초대 링크 접근 시
  useEffect(() => {
    if (!authLoading && !firebaseUser && status === "ready") {
      // 토큰을 저장해두고 로그인 페이지로 이동
      sessionStorage.setItem("pendingInviteToken", token);
      router.push("/login");
    }
  }, [authLoading, firebaseUser, status, token, router]);

  const handleJoin = async () => {
    if (!firebaseUser || !inviteLink) return;

    setStatus("joining");
    const displayName = user?.displayName || firebaseUser.displayName || "사용자";
    const result = await joinSessionViaLink(token, firebaseUser.uid, displayName);

    if (result.success && result.sessionId) {
      router.push(`/chat/${result.sessionId}`);
    } else {
      setErrorMsg(result.error || "참여에 실패했습니다.");
      setStatus("error");
    }
  };

  // 로딩
  if (status === "loading" || authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600" />
          <p className="mt-4 text-sm text-gray-500">초대 정보를 확인하고 있습니다...</p>
        </div>
      </div>
    );
  }

  // 에러
  if (status === "error") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="w-full max-w-sm rounded-2xl bg-white p-8 text-center shadow-lg">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
            <svg className="h-8 w-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h2 className="mt-4 text-lg font-bold text-gray-900">초대 링크 오류</h2>
          <p className="mt-2 text-sm text-gray-500">{errorMsg}</p>
          <button
            onClick={() => router.push("/")}
            className="mt-6 w-full rounded-xl bg-blue-600 py-3 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            홈으로 돌아가기
          </button>
        </div>
      </div>
    );
  }

  // 초대 정보 표시 + 참여 버튼
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 text-center shadow-lg">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-blue-100">
          <svg className="h-8 w-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
          </svg>
        </div>

        <h2 className="mt-4 text-lg font-bold text-gray-900">대화 초대</h2>

        <div className="mt-4 rounded-xl bg-gray-50 p-4">
          <p className="text-sm text-gray-500">초대한 사람</p>
          <p className="font-medium text-gray-900">{inviteLink?.fromName}</p>
          <div className="my-3 border-t border-gray-200" />
          <p className="text-sm text-gray-500">대화 주제</p>
          <p className="font-medium text-gray-900">{inviteLink?.sessionTitle}</p>
        </div>

        <button
          onClick={handleJoin}
          disabled={status === "joining"}
          className="mt-6 w-full rounded-xl bg-blue-600 py-3 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {status === "joining" ? "참여 중..." : "대화에 참여하기"}
        </button>

        <button
          onClick={() => router.push("/")}
          className="mt-2 w-full rounded-xl py-3 text-sm text-gray-500 hover:bg-gray-50 transition-colors"
        >
          취소
        </button>
      </div>
    </div>
  );
}
