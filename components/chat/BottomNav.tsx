"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, usePathname, useParams } from "next/navigation";
import { onSessionsSnapshot, ensureFutureSelfSession, updateSessionTitle } from "@/lib/firebase";
import { formatRelativeDate } from "@/lib/locale";
import NewChatModal from "@/components/chat/NewChatModal";
import type { ChatSession } from "@/types";

const MAX_TITLE_LEN = 80;
const MAX_INLINE_PARTICIPANTS = 3;

interface BottomNavProps {
  uid: string;
  displayName: string;
}

type Tab = "future" | "advisors" | "inbox";

export default function BottomNav({ uid, displayName }: BottomNavProps) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams();
  const activeSessionId = params?.sessionId as string | undefined;
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [futureSelfId, setFutureSelfId] = useState<string | null>(null);
  const [showNewChat, setShowNewChat] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const renameCancelledRef = useRef(false);

  const beginRename = (e: React.MouseEvent, session: ChatSession) => {
    e.stopPropagation();
    renameCancelledRef.current = false;
    setEditingId(session.id);
    setEditValue(session.title || "");
  };

  const saveRename = async (session: ChatSession) => {
    if (renameCancelledRef.current) {
      renameCancelledRef.current = false;
      setEditingId(null);
      return;
    }
    const next = editValue.trim();
    setEditingId(null);
    if (!next || next === session.title) return;
    try {
      await updateSessionTitle(session.id, next.slice(0, MAX_TITLE_LEN));
    } catch (err) {
      console.error("세션 이름 변경 실패:", err);
      window.alert("이름 변경에 실패했습니다. 잠시 후 다시 시도해주세요.");
    }
  };

  const getParticipantInfo = (session: ChatSession): { total: number; preview: string } => {
    const total = session.participants?.length || Object.keys(session.participantNames || {}).length || 0;
    const others = Object.entries(session.participantNames || {})
      .filter(([u]) => u !== uid)
      .map(([, n]) => n)
      .filter((n): n is string => Boolean(n && n.trim().length > 0));
    const shownNames = others.slice(0, MAX_INLINE_PARTICIPANTS).join(", ");
    const preview =
      others.length > MAX_INLINE_PARTICIPANTS
        ? `${shownNames} 외 ${others.length - MAX_INLINE_PARTICIPANTS}명`
        : shownNames;
    return { total, preview };
  };

  useEffect(() => {
    if (!uid) return;
    ensureFutureSelfSession(uid, displayName)
      .then((id) => setFutureSelfId(id))
      .catch(() => {});
  }, [uid, displayName]);

  useEffect(() => {
    if (!uid) return;
    const unsub = onSessionsSnapshot(uid, setSessions);
    return unsub;
  }, [uid]);

  // 받은편지함(DM/그룹)의 미확인 카운트 합산 (모바일 탭 배지)
  const inboxUnread = sessions
    .filter((s) => s.sessionType === "dm" || s.sessionType === "group")
    .reduce((sum, s) => sum + (s.unreadCounts?.[uid] || 0), 0);

  // 데스크톱 사이드바에 표시할 대화 목록 (DM + 그룹, 고정 우선)
  const chatList = useMemo(() => {
    const list = sessions.filter(
      (s) => s.sessionType === "dm" || s.sessionType === "group"
    );
    return list.sort((a, b) => {
      const aPinned = a.pinnedBy?.includes(uid) ? 1 : 0;
      const bPinned = b.pinnedBy?.includes(uid) ? 1 : 0;
      if (aPinned !== bPinned) return bPinned - aPinned;
      const aTime = a.lastMessageAt?.toMillis?.() ?? a.updatedAt?.toMillis?.() ?? 0;
      const bTime = b.lastMessageAt?.toMillis?.() ?? b.updatedAt?.toMillis?.() ?? 0;
      return bTime - aTime;
    });
  }, [sessions, uid]);

  // 현재 활성 탭 판정 (모바일 바텀 탭에서만 사용)
  const activeTab: Tab | null = (() => {
    if (pathname === "/chat/advisors") return "advisors";
    if (pathname === "/chat/inbox") return "inbox";
    if (pathname?.startsWith("/chat/")) {
      const id = pathname.split("/")[2];
      const session = sessions.find((s) => s.id === id);
      if (!session) return "future";
      if (session.sessionType === "future-self") return "future";
      if (session.sessionType === "ai") return "advisors";
      return "inbox";
    }
    return "future";
  })();

  const goFuture = () => {
    if (futureSelfId) router.push(`/chat/${futureSelfId}`);
    else router.push("/chat");
  };
  const goAdvisors = () => router.push("/chat/advisors");
  const goInbox = () => router.push("/chat/inbox");
  const goSession = (id: string) => router.push(`/chat/${id}`);

  const mobileTabs: {
    id: Tab;
    label: string;
    icon: string;
    onClick: () => void;
    badge?: number;
  }[] = [
    { id: "future", label: "미래의 나", icon: "🌟", onClick: goFuture },
    { id: "advisors", label: "자문단", icon: "🧭", onClick: goAdvisors },
    { id: "inbox", label: "받은편지함", icon: "💬", onClick: goInbox, badge: inboxUnread },
  ];

  const formatSessionDate = (timestamp: { toDate?: () => Date } | undefined) => {
    if (!timestamp?.toDate) return "";
    return formatRelativeDate(timestamp.toDate());
  };

  const renderChatItem = (session: ChatSession) => {
    const unreadCount = session.unreadCounts?.[uid] || 0;
    const isPinned = session.pinnedBy?.includes(uid) || false;
    const isMuted = session.mutedBy?.includes(uid) || false;
    const typeIcon = session.sessionType === "dm" ? "💬" : "👥";
    const isActive = activeSessionId === session.id;
    const isEditing = editingId === session.id;
    const { total: participantCount, preview: participantPreview } = getParticipantInfo(session);

    return (
      <li key={session.id}>
        <div
          role="button"
          tabIndex={0}
          onClick={() => { if (!isEditing) goSession(session.id); }}
          onKeyDown={(e) => {
            if (isEditing) return;
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              goSession(session.id);
            }
          }}
          className={`group flex w-full cursor-pointer items-start gap-2 border-b border-gray-100 px-3 py-2.5 text-left transition-colors ${
            isActive ? "bg-blue-50" : "bg-white hover:bg-gray-50"
          }`}
        >
          <span className="mt-0.5 text-base shrink-0">{typeIcon}</span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1">
              {isEditing ? (
                <input
                  autoFocus
                  value={editValue}
                  maxLength={MAX_TITLE_LEN}
                  onChange={(e) => setEditValue(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === "Enter") {
                      e.preventDefault();
                      (e.currentTarget as HTMLInputElement).blur();
                    } else if (e.key === "Escape") {
                      e.preventDefault();
                      renameCancelledRef.current = true;
                      (e.currentTarget as HTMLInputElement).blur();
                    }
                  }}
                  onBlur={() => saveRename(session)}
                  className="w-full min-w-0 rounded border border-blue-300 bg-white px-1.5 py-0.5 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
              ) : (
                <>
                  <p className={`truncate text-sm ${isActive ? "font-semibold text-blue-700" : "font-medium text-gray-900"}`}>
                    {session.title || "새 대화"}
                  </p>
                  {isPinned && <span className="shrink-0 text-[10px] text-gray-400" title="고정됨">📌</span>}
                  {isMuted && <span className="shrink-0 text-[10px] text-gray-400" title="음소거">🔇</span>}
                </>
              )}
            </div>
            {!isEditing && participantCount > 0 && (
              <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-gray-500">
                <svg className="h-3 w-3 shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span className="shrink-0 font-medium text-gray-600">{participantCount}명</span>
                {participantPreview && (
                  <span className="truncate text-gray-500">· {participantPreview}</span>
                )}
              </p>
            )}
            {!isEditing && session.lastMessage && (
              <p className="mt-0.5 truncate text-xs text-gray-500">
                {session.lastMessageSenderName && (
                  <span className="font-medium">{session.lastMessageSenderName}: </span>
                )}
                {session.lastMessage}
              </p>
            )}
            <div className="mt-0.5 flex items-center gap-2 text-[10px] text-gray-400">
              <span>{formatSessionDate(session.lastMessageAt || session.updatedAt)}</span>
            </div>
          </div>
          {!isEditing && (
            <button
              type="button"
              onClick={(e) => beginRename(e, session)}
              className="mt-0.5 shrink-0 rounded p-1 text-gray-300 opacity-0 transition-opacity hover:bg-gray-100 hover:text-gray-600 group-hover:opacity-100 focus:opacity-100"
              title="이름 변경"
              aria-label="대화 이름 변경"
            >
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
          )}
          {unreadCount > 0 && !isEditing && (
            <span className="mt-1 shrink-0 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </div>
      </li>
    );
  };

  return (
    <>
      {/* 모바일: 바텀 탭 (기존 동작 유지) */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 flex border-t border-gray-200/70 bg-white/85 backdrop-blur-xl safe-pb lg:hidden">
        {mobileTabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={tab.onClick}
              className={`relative flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] transition-colors ${
                isActive ? "text-[#007aff]" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              <span className="text-xl leading-none">{tab.icon}</span>
              <span className={isActive ? "font-semibold" : ""}>{tab.label}</span>
              {tab.badge && tab.badge > 0 ? (
                <span className="absolute right-1/4 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                  {tab.badge > 99 ? "99+" : tab.badge}
                </span>
              ) : null}
            </button>
          );
        })}
      </nav>

      {/* 데스크톱: 좌측 사이드바 (기존 대화 목록이 바로 노출됨) */}
      <aside className="hidden lg:flex lg:w-72 lg:flex-col lg:border-r lg:border-gray-200 lg:bg-white">
        {/* 상단 빠른 이동: 미래의 나 / 자문단 */}
        <div className="flex items-center gap-1 border-b border-gray-200 p-2">
          <button
            onClick={goFuture}
            title="미래의 나"
            className={`flex flex-1 items-center justify-center gap-1 rounded-lg px-2 py-2 text-xs font-medium transition-colors ${
              activeTab === "future"
                ? "bg-blue-50 text-blue-600"
                : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            <span className="text-base leading-none">🌟</span>
            <span>미래의 나</span>
          </button>
          <button
            onClick={goAdvisors}
            title="자문단"
            className={`flex flex-1 items-center justify-center gap-1 rounded-lg px-2 py-2 text-xs font-medium transition-colors ${
              activeTab === "advisors"
                ? "bg-blue-50 text-blue-600"
                : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            <span className="text-base leading-none">🧭</span>
            <span>자문단</span>
          </button>
        </div>

        {/* 대화 목록 헤더 */}
        <div className="flex items-center justify-between border-b border-gray-200 px-3 py-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
            대화 ({chatList.length})
          </h2>
          <button
            onClick={() => setShowNewChat(true)}
            className="rounded-md bg-blue-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-blue-700"
          >
            + 새 대화
          </button>
        </div>

        {/* 대화 목록 */}
        <div className="flex-1 overflow-y-auto">
          {chatList.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs text-gray-400">
              아직 대화가 없습니다.
              <br />
              새 대화를 만들어 보세요.
            </div>
          ) : (
            <ul>{chatList.map(renderChatItem)}</ul>
          )}
        </div>
      </aside>

      {showNewChat && (
        <NewChatModal
          uid={uid}
          displayName={displayName}
          onClose={() => setShowNewChat(false)}
        />
      )}
    </>
  );
}
