"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { onSessionsSnapshot, deleteSession, pinSession, unpinSession, muteSession, unmuteSession } from "@/lib/firebase";
import { formatRelativeDate } from "@/lib/locale";
import { getSessionParticipantCounts } from "@/lib/sessionMeta";
import type { ChatSession } from "@/types";

interface SessionSidebarProps {
  uid: string;
  isOpen: boolean;
  onClose: () => void;
}

export default function SessionSidebar({ uid, isOpen, onClose }: SessionSidebarProps) {
  const router = useRouter();
  const params = useParams();
  const currentSessionId = params.sessionId as string | undefined;
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [contextMenuId, setContextMenuId] = useState<string | null>(null);

  useEffect(() => {
    if (!uid) return;
    const unsub = onSessionsSnapshot(uid, setSessions);
    return unsub;
  }, [uid]);

  const handleSelectSession = (sessionId: string) => {
    router.push(`/chat/${sessionId}`);
    onClose();
  };

  const handleNewChat = () => {
    router.push("/chat");
    onClose();
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
      if (currentSessionId === session.id) {
        router.push("/chat");
      }
    } catch (err) {
      console.error("세션 삭제 실패:", err);
      window.alert("삭제에 실패했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setDeletingId(null);
    }
  };

  const formatSessionDate = (timestamp: { toDate?: () => Date }) => {
    if (!timestamp?.toDate) return "";
    return formatRelativeDate(timestamp.toDate());
  };

  return (
    <>
      {/* 오버레이 (모바일) */}
      {isOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/30 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* 사이드바 */}
      <aside
        className={`
          fixed left-0 top-0 z-40 flex h-full w-72 flex-col border-r border-gray-200 bg-gray-50 transition-transform duration-200
          lg:relative lg:z-0 lg:translate-x-0
          ${isOpen ? "translate-x-0" : "-translate-x-full"}
        `}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-gray-700">대화 목록</h2>
          <div className="flex items-center gap-1">
            <button
              onClick={handleNewChat}
              className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-200 transition-colors"
              title="새 대화"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-200 transition-colors lg:hidden"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* 세션 목록 */}
        <div className="flex-1 overflow-y-auto">
          {sessions.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-gray-400">
              대화가 없습니다.
              <br />
              새 대화를 시작해보세요!
            </div>
          ) : (
            <ul className="py-1">
              {/* 고정 세션 먼저, 그 다음 updatedAt 순 */}
              {[...sessions]
                .sort((a, b) => {
                  const aPinned = a.pinnedBy?.includes(uid) ? 1 : 0;
                  const bPinned = b.pinnedBy?.includes(uid) ? 1 : 0;
                  return bPinned - aPinned;
                })
                .map((session) => {
                const isActive = session.id === currentSessionId;
                const { total: participantCount, humans: humanCount } =
                  getSessionParticipantCounts(session);
                const sessionType = session.sessionType || "ai";
                const unreadCount = session.unreadCounts?.[uid] || 0;
                const isPinned = session.pinnedBy?.includes(uid) || false;
                const isMuted = session.mutedBy?.includes(uid) || false;
                const typeIcon = sessionType === "dm" ? "💬" : sessionType === "group" ? "👥" : "🤖";

                return (
                  <li key={session.id}>
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => handleSelectSession(session.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          handleSelectSession(session.id);
                        }
                      }}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        setContextMenuId(contextMenuId === session.id ? null : session.id);
                      }}
                      className={`
                        group flex w-full cursor-pointer items-start gap-2 px-3 py-2.5 text-left transition-colors
                        ${isActive ? "bg-blue-50 border-r-2 border-blue-500" : "hover:bg-gray-100"}
                      `}
                    >
                      {/* 세션 타입 아이콘 */}
                      <span className="mt-0.5 text-sm shrink-0">{typeIcon}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1">
                          <p
                            className={`truncate text-sm ${
                              isActive ? "font-medium text-blue-700" : "text-gray-800"
                            }`}
                          >
                            {session.title || "새 대화"}
                          </p>
                          {isPinned && <span className="shrink-0 text-xs text-gray-400" title="고정됨">📌</span>}
                          {isMuted && <span className="shrink-0 text-xs text-gray-400" title="음소거">🔇</span>}
                        </div>
                        {/* 마지막 메시지 미리보기 */}
                        {session.lastMessage && (
                          <p className="mt-0.5 truncate text-xs text-gray-400">
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
                      {/* 안읽은 메시지 배지 */}
                      {unreadCount > 0 && (
                        <span className="mt-1 shrink-0 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-bold text-white">
                          {unreadCount > 99 ? "99+" : unreadCount}
                        </span>
                      )}
                      {/* 삭제/나가기 버튼 */}
                      {unreadCount === 0 && (
                        <button
                          onClick={(e) => handleDelete(e, session)}
                          className={`
                            mt-0.5 shrink-0 rounded p-1 text-gray-300 transition-colors
                            hover:bg-red-50 hover:text-red-500
                            ${isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100"}
                          `}
                          title={humanCount > 1 ? "대화방 나가기" : "대화 삭제"}
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
                    {/* 컨텍스트 메뉴 (고정/음소거) */}
                    {contextMenuId === session.id && (
                      <div className="mx-3 mb-1 rounded-lg border border-gray-200 bg-white py-1 shadow-lg text-xs">
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            isPinned ? await unpinSession(session.id, uid) : await pinSession(session.id, uid);
                            setContextMenuId(null);
                          }}
                          className="flex w-full items-center gap-2 px-3 py-1.5 text-gray-700 hover:bg-gray-100"
                        >
                          {isPinned ? "📌 고정 해제" : "📌 고정"}
                        </button>
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            isMuted ? await unmuteSession(session.id, uid) : await muteSession(session.id, uid);
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
              })}
            </ul>
          )}
        </div>
      </aside>
    </>
  );
}
