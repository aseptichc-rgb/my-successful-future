"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { findUserByEmail, findExistingDM, createSession } from "@/lib/firebase";

interface Props {
  uid: string;
  displayName: string;
  onClose: () => void;
}

type Step = "choose" | "dm-search" | "group-setup";

export default function NewChatModal({ uid, displayName, onClose }: Props) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("choose");
  const [email, setEmail] = useState("");
  const [groupName, setGroupName] = useState("");
  const [groupEmails, setGroupEmails] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  // AI 채팅 = 자문단으로 진입 (페르소나를 카드에서 고른다)
  const handleOpenAdvisors = () => {
    router.push("/chat/advisors");
    onClose();
  };

  // DM 생성
  const handleCreateDM = async () => {
    if (!email.trim()) return;
    setStatus("loading");
    setErrorMsg("");

    try {
      const targetUser = await findUserByEmail(email.trim());
      if (!targetUser) {
        setErrorMsg("해당 이메일의 사용자를 찾을 수 없습니다.");
        setStatus("error");
        return;
      }
      if (targetUser.uid === uid) {
        setErrorMsg("자기 자신에게는 DM을 보낼 수 없습니다.");
        setStatus("error");
        return;
      }

      // 기존 DM 세션 확인
      const existing = await findExistingDM(uid, targetUser.uid);
      if (existing) {
        router.push(`/chat/${existing.id}`);
        onClose();
        return;
      }

      // 새 DM 세션 생성
      const sessionId = await createSession(
        uid,
        targetUser.displayName,
        displayName,
        "dm",
        [uid, targetUser.uid],
        { [uid]: displayName, [targetUser.uid]: targetUser.displayName }
      );
      router.push(`/chat/${sessionId}`);
      onClose();
    } catch {
      setErrorMsg("DM 생성에 실패했습니다.");
      setStatus("error");
    }
  };

  // 그룹 채팅 생성
  const handleCreateGroup = async () => {
    if (!groupName.trim()) {
      setErrorMsg("그룹 이름을 입력해주세요.");
      setStatus("error");
      return;
    }

    setStatus("loading");
    setErrorMsg("");

    try {
      const emails = groupEmails
        .split(",")
        .map((e) => e.trim())
        .filter((e) => e.length > 0);

      const participantUids = [uid];
      const participantNames: Record<string, string> = { [uid]: displayName };

      for (const email of emails) {
        const user = await findUserByEmail(email);
        if (user && user.uid !== uid) {
          participantUids.push(user.uid);
          participantNames[user.uid] = user.displayName;
        }
      }

      const sessionId = await createSession(
        uid,
        groupName.trim(),
        displayName,
        "group",
        participantUids,
        participantNames
      );
      router.push(`/chat/${sessionId}`);
      onClose();
    } catch {
      setErrorMsg("그룹 생성에 실패했습니다.");
      setStatus("error");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        {/* 헤더 */}
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">
            {step === "choose" && "새 대화 시작"}
            {step === "dm-search" && "다이렉트 메시지"}
            {step === "group-setup" && "그룹 채팅"}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 선택 화면 */}
        {step === "choose" && (
          <div className="space-y-3">
            <button
              onClick={handleOpenAdvisors}
              className="flex w-full items-center gap-4 rounded-xl border border-gray-200 p-4 text-left transition-colors hover:border-blue-300 hover:bg-blue-50"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-xl">
                🧭
              </div>
              <div>
                <p className="font-medium text-gray-900">자문단</p>
                <p className="text-sm text-gray-500">AI 전문가에게 조언 받기</p>
              </div>
            </button>
            <button
              onClick={() => setStep("dm-search")}
              className="flex w-full items-center gap-4 rounded-xl border border-gray-200 p-4 text-left transition-colors hover:border-green-300 hover:bg-green-50"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100 text-xl">
                💬
              </div>
              <div>
                <p className="font-medium text-gray-900">다이렉트 메시지</p>
                <p className="text-sm text-gray-500">1:1 대화를 시작합니다</p>
              </div>
            </button>
            <button
              onClick={() => setStep("group-setup")}
              className="flex w-full items-center gap-4 rounded-xl border border-gray-200 p-4 text-left transition-colors hover:border-purple-300 hover:bg-purple-50"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-100 text-xl">
                👥
              </div>
              <div>
                <p className="font-medium text-gray-900">그룹 채팅</p>
                <p className="text-sm text-gray-500">여러 사람과 함께 대화</p>
              </div>
            </button>
          </div>
        )}

        {/* DM 검색 */}
        {step === "dm-search" && (
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                상대방 이메일
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setStatus("idle"); setErrorMsg(""); }}
                placeholder="example@email.com"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                onKeyDown={(e) => e.key === "Enter" && handleCreateDM()}
              />
            </div>
            {errorMsg && <p className="text-sm text-red-500">{errorMsg}</p>}
            <div className="flex gap-2">
              <button
                onClick={() => { setStep("choose"); setErrorMsg(""); }}
                className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                뒤로
              </button>
              <button
                onClick={handleCreateDM}
                disabled={status === "loading" || !email.trim()}
                className="flex-1 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
              >
                {status === "loading" ? "검색 중..." : "대화 시작"}
              </button>
            </div>
          </div>
        )}

        {/* 그룹 설정 */}
        {step === "group-setup" && (
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                그룹 이름
              </label>
              <input
                type="text"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="그룹 이름을 입력하세요"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                참여자 이메일 (쉼표로 구분)
              </label>
              <textarea
                value={groupEmails}
                onChange={(e) => { setGroupEmails(e.target.value); setStatus("idle"); setErrorMsg(""); }}
                placeholder="user1@email.com, user2@email.com"
                rows={3}
                className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <p className="mt-1 text-xs text-gray-400">
                나중에 초대 링크로 추가 참여자를 초대할 수 있습니다
              </p>
            </div>
            {errorMsg && <p className="text-sm text-red-500">{errorMsg}</p>}
            <div className="flex gap-2">
              <button
                onClick={() => { setStep("choose"); setErrorMsg(""); }}
                className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                뒤로
              </button>
              <button
                onClick={handleCreateGroup}
                disabled={status === "loading" || !groupName.trim()}
                className="flex-1 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
              >
                {status === "loading" ? "생성 중..." : "그룹 만들기"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
