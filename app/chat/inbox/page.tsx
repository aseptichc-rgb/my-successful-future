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
import NewChatModal from "@/components/chat/NewChatModal";
import type { ChatSession } from "@/types";

export default function InboxPage() {
  const router = useRouter();
  const { user, firebaseUser, loading } = useAuth();
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [contextMenuId, setContextMenuId] = useState<string | null>(null);

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
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600" />
      </div>
    );
  }

  const uid = firebaseUser.uid;
  const dms = sessions.filter((s) => s.sessionType === "dm");
  const groups = sessions.filter((s) => s.sessionType === "group");

  const sortByPinned = (a: ChatSession, b: ChatSession) => {
    const aPinned = a.pinnedBy?.includes(uid) ? 1 : 0;
    const bPinned = b.pinnedBy?.includes(uid) ? 1 : 0;
    return bPinned - aPinned;
  };

  const sortedDms = [...dms].sort(sortByPinned);
  const sortedGroups = [...groups].sort(sortByPinned);

  const handleSelect = (sessionId: string) => {
    router.push(`/chat/${sessionId}`);
  };

  const handleDelete = async (e: React.MouseEvent, session: ChatSession) => {
    e.stopPropagation();
    if (deletingId) return;
    const isMulti = (session.participants?.length || 1) > 1;
    const confirmMsg = isMulti
      ? `"${session.title || "이 대화"}"에서 나가시겠습니까?`
      : `"${session.title || "이 대화"}"를 삭제하시겠습니까? 모든 메시지가 함께 삭제됩니다.`;
    if (!window.confirm(confirmMsg)) return;

    setDeletingId(session.id);
    try {
      await deleteSession(session.id, uid);
    } catch (err) {
      console.error("세션 삭제 실패:", err);
      window.alert("삭제에 실패했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setDeletingId(null);
    }
  };

  const formatSessionDate = (timestamp: { toDate?: () => Date } | undefined) => {
    if (!timestamp?.toDate) return "";
    return formatRelativeDate(timestamp.toDate());
  };

  const renderSessionItem = (session: ChatSession) => {
    const participantCount = session.participants?.length || 1;
    const sessionType = session.sessionType;
    const unreadCount = session.unreadCounts?.[uid] || 0;
    const isPinned = session.pinnedBy?.includes(uid) || false;
    const isMuted = session.mutedBy?.includes(uid) || false;
    const typeIcon = sessionType === "dm" ? "💬" : "👥";

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
          className="group flex w-full cursor-pointer items-start gap-2 border-b border-gray-100 bg-white px-4 py-3 text-left transition-colors hover:bg-gray-50"
        >
          <span className="mt-0.5 text-base shrink-0">{typeIcon}</span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1">
              <p className="truncate text-sm font-medium text-gray-900">
                {session.title || "새 대화"}
              </p>
              {isPinned && <span className="shrink-0 text-xs text-gray-400" title="고정됨">📌</span>}
              {isMuted && <span className="shrink-0 text-xs text-gray-400" title="음소거">🔇</span>}
            </div>
            {session.lastMessage && (
              <p className="mt-0.5 truncate text-xs text-gray-500">
                {session.lastMessageSenderName && (
                  <span className="font-medium">{session.lastMessageSenderName}: </span>
                )}
                {session.lastMessage}
              </p>
            )}
            <div className="mt-0.5 flex items-center gap-2 text-xs text-gray-400">
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
            <span className="mt-1 shrink-0 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-bold text-white">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          ) : (
            <button
              onClick={(e) => handleDelete(e, session)}
              className="mt-0.5 shrink-0 rounded p-1 text-gray-300 opacity-0 transition-colors hover:bg-red-50 hover:text-red-500 group-hover:opacity-100"
              title={participantCount > 1 ? "대화방 나가기" : "대화 삭제"}
              disabled={deletingId === session.id}
            >
              {deletingId === session.id ? (
                <div className="h-3.5 w-3.5 animate-spin rounded-full border border-gray-300 border-t-red-500" />
              ) : (
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              )}
            </button>
          )}
        </div>
        {contextMenuId === session.id && (
          <div className="mx-3 mb-1 rounded-lg border border-gray-200 bg-white py-1 text-xs shadow-lg">
            <button
              onClick={async (e) => {
                e.stopPropagation();
                if (isPinned) await unpinSession(session.id, uid);
                else await pinSession(session.id, uid);
                setContextMenuId(null);
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-gray-700 hover:bg-gray-100"
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
              className="flex w-full items-center gap-2 px-3 py-1.5 text-gray-700 hover:bg-gray-100"
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
    <div className="flex h-full flex-col bg-gray-50">
      <header className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-4">
        <div>
          <h1 className="text-lg font-bold text-gray-900">💬 받은편지함</h1>
          <p className="mt-1 text-xs text-gray-500">사람과의 1:1 대화와 그룹 채팅</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
        >
          + 새 대화
        </button>
      </header>

      <div className="flex-1 overflow-y-auto pb-24 lg:pb-4">
        {/* DM 섹션 */}
        <section>
          <h2 className="sticky top-0 z-10 border-b border-gray-200 bg-gray-50 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
            다이렉트 메시지 ({sortedDms.length})
          </h2>
          {sortedDms.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-gray-400">
              아직 1:1 대화가 없습니다.
            </div>
          ) : (
            <ul>{sortedDms.map(renderSessionItem)}</ul>
          )}
        </section>

        {/* 그룹 섹션 */}
        <section className="mt-2">
          <h2 className="sticky top-0 z-10 border-b border-gray-200 bg-gray-50 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
            그룹 ({sortedGroups.length})
          </h2>
          {sortedGroups.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-gray-400">
              아직 그룹 대화가 없습니다.
            </div>
          ) : (
            <ul>{sortedGroups.map(renderSessionItem)}</ul>
          )}
        </section>
      </div>

      {showModal && (
        <NewChatModal
          uid={uid}
          displayName={displayName}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}
