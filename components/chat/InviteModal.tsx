"use client";

import { useState } from "react";
import { findUserByEmail, sendInvitation } from "@/lib/firebase";

interface Props {
  sessionId: string;
  sessionTitle: string;
  fromUid: string;
  fromName: string;
  participants: string[];
  onClose: () => void;
}

export default function InviteModal({
  sessionId,
  sessionTitle,
  fromUid,
  fromName,
  participants,
  onClose,
}: Props) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const handleInvite = async () => {
    if (!email.trim()) return;

    setStatus("loading");
    setErrorMsg("");

    try {
      const user = await findUserByEmail(email);

      if (!user) {
        setErrorMsg("해당 이메일로 가입된 사용자를 찾을 수 없습니다.");
        setStatus("error");
        return;
      }

      if (user.uid === fromUid) {
        setErrorMsg("자기 자신은 초대할 수 없습니다.");
        setStatus("error");
        return;
      }

      if (participants.includes(user.uid)) {
        setErrorMsg("이미 대화에 참여 중인 사용자입니다.");
        setStatus("error");
        return;
      }

      await sendInvitation(sessionId, sessionTitle, fromUid, fromName, user.uid, email);
      setStatus("success");
      setEmail("");
    } catch {
      setErrorMsg("초대 전송에 실패했습니다.");
      setStatus("error");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">대화에 초대하기</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <p className="mt-2 text-sm text-gray-500">
          이메일 주소로 다른 사용자를 이 대화에 초대할 수 있습니다.
        </p>

        <div className="mt-4 flex gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (status !== "idle") setStatus("idle");
            }}
            onKeyDown={(e) => e.key === "Enter" && handleInvite()}
            placeholder="초대할 사용자의 이메일"
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <button
            onClick={handleInvite}
            disabled={status === "loading" || !email.trim()}
            className="shrink-0 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {status === "loading" ? "검색 중..." : "초대"}
          </button>
        </div>

        {status === "error" && (
          <p className="mt-2 text-sm text-red-600">{errorMsg}</p>
        )}

        {status === "success" && (
          <p className="mt-2 text-sm text-green-600">초대를 보냈습니다! 상대방이 수락하면 대화에 참여합니다.</p>
        )}
      </div>
    </div>
  );
}
