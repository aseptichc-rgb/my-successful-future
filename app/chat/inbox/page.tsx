"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import {
  onSessionsSnapshot,
  deleteSession,
  pinSession,
  unpinSession,
  muteSession,
  unmuteSession,
} from "@/lib/firebase";
import { formatRelativeDate } from "@/lib/locale";
import { getSessionParticipantCounts } from "@/lib/sessionMeta";
import NewChatModal from "@/components/chat/NewChatModal";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import type { ChatSession } from "@/types";

export default function InboxPage() {
  const router = useRouter();
  const { user, firebaseUser, loading } = useAuth();
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [contextMenuId, setContextMenuId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ChatSession | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!firebaseUser) {
      router.push("/login");
      return;
    }
    const unsub = onSessionsSnapshot(firebaseUser.uid, setSessions);
    return unsub;
  }, [firebaseUser, loading, router]);

  if (loading || !firebaseUser) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-black/10 border-t-[#1E1B4B]" />
      </div>
    );
  }

  const uid = firebaseUser.uid;

  const getSessionTime = (s: ChatSession) =>
    s.lastMessageAt?.toMillis?.() ?? s.updatedAt?.toMillis?.() ?? 0;

  const sortedSessions = [...sessions].sort((a, b) => {
    const aPinned = a.pinnedBy?.includes(uid) ? 1 : 0;
    const bPinned = b.pinnedBy?.includes(uid) ? 1 : 0;
    if (aPinned !== bPinned) return bPinned - aPinned;
    return getSessionTime(b) - getSessionTime(a);
  });

  const handleSelect = (sessionId: string) => {
    router.push(`/chat/${sessionId}`);
  };

  const handleDelete = (e: React.MouseEvent, session: ChatSession) => {
    e.stopPropagation();
    if (deletingId) return;
    setPendingDelete(session);
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    const session = pendingDelete;
    setDeletingId(session.id);
    try {
      await deleteSession(session.id, uid);
      setPendingDelete(null);
    } catch (err) {
      console.error("세션 삭제 실패:", err);
      window.alert("삭제에 실패했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setDeletingId(null);
    }
  };

  const pendingIsLeaveOnly = (pendingDelete?.participants?.length || 1) > 1;

  const formatSessionDate = (timestamp: { toDate?: () => Date } | undefined) => {
    if (!timestamp?.toDate) return "";
    return formatRelativeDate(timestamp.toDate());
  };

  const renderSessionItem = (session: ChatSession) => {
    const { total: participantCount, humans: humanCount } =
      getSessionParticipantCounts(session);
    const sessionType = session.sessionType;
    const unreadCount = session.unreadCounts?.[uid] || 0;
    const isPinned = session.pinnedBy?.includes(uid) || false;
    const isMuted = session.mutedBy?.includes(uid) || false;
    const typeIcon =
      sessionType === "ai"
        ? "🤖"
        : sessionType === "dm"
          ? "💬"
          : "👥";

    return (
      <li key={session.id}>
        <div
          role="button"
          tabIndex={0}
          onClick={() => handleSelect(session.id)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              handleSelect(session.id);
            }
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            setContextMenuId(contextMenuId === session.id ? null : session.id);
          }}
          className="group flex w-full cursor-pointer items-start gap-3 border-b border-black/[0.04] bg-white px-5 py-4 text-left transition-colors hover:bg-black/[0.02]"
        >
          <span
            aria-hidden
            className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#F0EDE6] text-[16px]"
          >
            {typeIcon}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <p className="truncate text-[15px] font-medium tracking-[-0.022em] text-[#1E1B4B]">
                {session.title || "새 대화"}
              </p>
              {isPinned && <span className="shrink-0 text-[11px] text-black/40" title="고정됨">📌</span>}
              {isMuted && <span className="shrink-0 text-[11px] text-black/40" title="음소거">🔇</span>}
            </div>
            {session.lastMessage && (
              <p className="mt-0.5 truncate text-[13px] tracking-[-0.01em] text-black/56">
                {session.lastMessageSenderName && (
                  <span className="font-medium text-black/70">{session.lastMessageSenderName}: </span>
                )}
                {session.lastMessage}
              </p>
            )}
            <div className="mt-1 flex items-center gap-2.5 text-[11px] tracking-[-0.01em] text-black/48">
              <span>{formatSessionDate(session.lastMessageAt || session.updatedAt)}</span>
              {participantCount > 1 && (
                <span className="flex items-center gap-0.5">
                  <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  {participantCount}
                </span>
              )}
            </div>
          </div>
          {unreadCount > 0 ? (
            <span className="mt-1 flex h-[20px] min-w-[20px] shrink-0 items-center justify-center rounded-full bg-[#1E1B4B] px-1.5 text-[11px] font-semibold text-white">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          ) : (
            <button
              onClick={(e) => handleDelete(e, session)}
              className="mt-0.5 shrink-0 rounded-full p-1.5 text-black/30 opacity-0 transition-all hover:bg-[#D85A30]/10 hover:text-[#D85A30] group-hover:opacity-100"
              title={humanCount > 1 ? "대화방 나가기" : "대화 삭제"}
              disabled={deletingId === session.id}
            >
              {deletingId === session.id ? (
                <div className="h-3.5 w-3.5 animate-spin rounded-full border border-black/10 border-t-[#D85A30]" />
              ) : (
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              )}
            </button>
          )}
        </div>
        {contextMenuId === session.id && (
          <div className="mx-3 mb-1 rounded-[12px] border border-black/[0.08] bg-white py-1 text-[13px] shadow-apple">
            <button
              onClick={async (e) => {
                e.stopPropagation();
                if (isPinned) await unpinSession(session.id, uid);
                else await pinSession(session.id, uid);
                setContextMenuId(null);
              }}
              className="flex w-full items-center gap-2 px-4 py-2 tracking-[-0.01em] text-black/80 hover:bg-black/[0.04]"
            >
              {isPinned ? "📌 고정 해제" : "📌 고정"}
            </button>
            <button
              onClick={async (e) => {
                e.stopPropagation();
                if (isMuted) await unmuteSession(session.id, uid);
                else await muteSession(session.id, uid);
                setContextMenuId(null);
              }}
              className="flex w-full items-center gap-2 px-4 py-2 tracking-[-0.01em] text-black/80 hover:bg-black/[0.04]"
            >
              {isMuted ? "🔔 알림 켜기" : "🔇 알림 끄기"}
            </button>
          </div>
        )}
      </li>
    );
  };

  const displayName = user?.displayName || firebaseUser.displayName || "사용자";

  return (
    <div className="flex h-full flex-col bg-[#F0EDE6]">
      <header className="border-b border-black/[0.06] bg-white px-5 py-5 sm:px-6 sm:py-7">
        <div className="mx-auto flex max-w-3xl items-end justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="text-[28px] font-semibold leading-[1.14] tracking-[-0.005em] text-[#1E1B4B] sm:text-[32px]">
              채팅
            </h1>
            <p className="mt-2 text-[15px] leading-[1.47] tracking-[-0.022em] text-black/60">
              친구·자문단·AI와 나눈 모든 대화가 여기 모여요.
            </p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="shrink-0 rounded-pill bg-[#1E1B4B] px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-[#2A2766]"
          >
            + 새 대화
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto pb-24 lg:pb-4">
        {sortedSessions.length === 0 ? (
          <div className="bg-white px-5 py-12 text-center text-[14px] tracking-[-0.022em] text-black/48">
            아직 대화가 없습니다.
          </div>
        ) : (
          <ul>{sortedSessions.map(renderSessionItem)}</ul>
        )}
      </div>

      {showModal && (
        <NewChatModal
          uid={uid}
          displayName={displayName}
          onClose={() => setShowModal(false)}
        />
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        title={pendingIsLeaveOnly ? "대화방에서 나갈까요?" : "대화를 삭제할까요?"}
        description={
          pendingIsLeaveOnly
            ? `"${pendingDelete?.title || "이 대화"}"에서 나가면 더 이상 새 메시지를 받을 수 없습니다.`
            : `"${pendingDelete?.title || "이 대화"}"의 모든 메시지가 함께 삭제되며 되돌릴 수 없습니다.`
        }
        confirmLabel={pendingIsLeaveOnly ? "나가기" : "삭제"}
        cancelLabel="취소"
        destructive
        loading={!!deletingId}
        onConfirm={confirmDelete}
        onCancel={() => {
          if (!deletingId) setPendingDelete(null);
        }}
      />
    </div>
  );
}
