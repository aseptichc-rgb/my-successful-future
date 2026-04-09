"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { onInvitationsSnapshot, acceptInvitation, declineInvitation } from "@/lib/firebase";
import type { Invitation } from "@/types";

interface Props {
  uid: string;
  displayName: string;
}

export default function InvitationBell({ uid, displayName }: Props) {
  const router = useRouter();
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [processing, setProcessing] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onInvitationsSnapshot(uid, setInvitations);
    return unsub;
  }, [uid]);

  const handleAccept = async (inv: Invitation) => {
    setProcessing(inv.id);
    try {
      await acceptInvitation(inv.id, uid, displayName);
      router.push(`/chat/${inv.sessionId}`);
    } catch {
      // 실패 시 무시
    } finally {
      setProcessing(null);
    }
  };

  const handleDecline = async (inv: Invitation) => {
    setProcessing(inv.id);
    try {
      await declineInvitation(inv.id);
    } catch {
      // 실패 시 무시
    } finally {
      setProcessing(null);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        className="relative rounded-lg border border-gray-300 p-1.5 text-gray-600 hover:bg-gray-50 transition-colors"
        title="초대 알림"
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {invitations.length > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
            {invitations.length}
          </span>
        )}
      </button>

      {showDropdown && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowDropdown(false)} />
          <div className="absolute right-0 top-full z-50 mt-1 w-80 rounded-xl border border-gray-200 bg-white py-2 shadow-lg">
            <p className="px-4 pb-2 text-xs font-medium text-gray-400">받은 초대</p>

            {invitations.length === 0 ? (
              <p className="px-4 py-3 text-center text-sm text-gray-400">새 초대가 없습니다</p>
            ) : (
              invitations.map((inv) => (
                <div key={inv.id} className="border-t border-gray-100 px-4 py-3">
                  <p className="text-sm text-gray-800">
                    <span className="font-semibold">{inv.fromName}</span>님이{" "}
                    <span className="font-medium text-blue-600">{inv.sessionTitle}</span>{" "}
                    대화에 초대했습니다.
                  </p>
                  <div className="mt-2 flex gap-2">
                    <button
                      onClick={() => handleAccept(inv)}
                      disabled={processing === inv.id}
                      className="rounded-lg bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
                    >
                      수락
                    </button>
                    <button
                      onClick={() => handleDecline(inv)}
                      disabled={processing === inv.id}
                      className="rounded-lg border border-gray-300 px-3 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                    >
                      거절
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
