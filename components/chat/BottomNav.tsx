"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, usePathname, useParams } from "next/navigation";
import { onSessionsSnapshot, ensureFutureSelfSession, updateSessionTitle, deleteSession } from "@/lib/firebase";
import { formatRelativeDate } from "@/lib/locale";
import { getSessionParticipantCounts } from "@/lib/sessionMeta";
import NewChatModal from "@/components/chat/NewChatModal";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import Logo from "@/components/ui/Logo";
import type { ChatSession } from "@/types";

const MAX_TITLE_LEN = 80;
const MAX_INLINE_PARTICIPANTS = 3;

interface BottomNavProps {
  uid: string;
  displayName: string;
}

type Tab = "home" | "future" | "advisors" | "inbox" | "settings";

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
  const [pendingDelete, setPendingDelete] = useState<ChatSession | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

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

  const beginDelete = (e: React.MouseEvent, session: ChatSession) => {
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
      // 현재 보고 있던 방을 떠난 경우 홈으로
      if (activeSessionId === session.id) {
        router.push("/chat");
      }
    } catch (err) {
      console.error("세션 나가기/삭제 실패:", err);
      window.alert("처리에 실패했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setDeletingId(null);
    }
  };

  const pendingIsLeaveOnly = (pendingDelete?.participants?.length || 1) > 1;

  const getParticipantInfo = (session: ChatSession): { total: number; preview: string } => {
    const { total } = getSessionParticipantCounts(session);
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

  // 데스크톱 사이드바에 표시할 대화 목록 (future-self는 상단 전용 버튼으로 따로 있으므로 제외, 그 외 전부 표시)
  const chatList = useMemo(() => {
    const list = sessions.filter((s) => s.sessionType !== "future-self");
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
    if (pathname === "/settings") return "settings";
    if (pathname === "/chat") return "home";
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
    return "home";
  })();

  const goHome = () => router.push("/chat");
  const goFuture = () => {
    if (futureSelfId) router.push(`/chat/${futureSelfId}`);
    else router.push("/chat");
  };
  const goAdvisors = () => router.push("/chat/advisors");
  const goInbox = () => router.push("/chat/inbox");
  const goSession = (id: string) => router.push(`/chat/${id}`);
  const goSettings = () => router.push("/settings");

  const mobileTabs: {
    id: Tab;
    label: string;
    icon: string;
    onClick: () => void;
    badge?: number;
  }[] = [
    { id: "home", label: "홈", icon: "🏠", onClick: goHome },
    { id: "future", label: "미래의 나", icon: "🌟", onClick: goFuture },
    { id: "advisors", label: "자문단", icon: "🧭", onClick: goAdvisors },
    { id: "inbox", label: "채팅", icon: "💬", onClick: goInbox, badge: inboxUnread },
    { id: "settings", label: "설정", icon: "⚙️", onClick: goSettings },
  ];

  const formatSessionDate = (timestamp: { toDate?: () => Date } | undefined) => {
    if (!timestamp?.toDate) return "";
    return formatRelativeDate(timestamp.toDate());
  };

  const renderChatItem = (session: ChatSession) => {
    const unreadCount = session.unreadCounts?.[uid] || 0;
    const isPinned = session.pinnedBy?.includes(uid) || false;
    const isMuted = session.mutedBy?.includes(uid) || false;
    const typeIcon =
      session.sessionType === "ai"
        ? "🤖"
        : session.sessionType === "dm"
          ? "💬"
          : "👥";
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
          className={`group flex w-full cursor-pointer items-start gap-2.5 border-b border-black/[0.04] px-3 py-3 text-left transition-colors ${
            isActive ? "bg-[#1E1B4B]/8" : "bg-white hover:bg-black/[0.02]"
          }`}
        >
          <span
            aria-hidden
            className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#F0EDE6] text-[14px]"
          >
            {typeIcon}
          </span>
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
                  className="w-full min-w-0 rounded-[8px] border border-[#1E1B4B]/40 bg-white px-2 py-1 text-[13px] text-[#1E1B4B] focus:outline-none focus:border-[#1E1B4B]"
                />
              ) : (
                <>
                  <p className={`truncate text-[13px] tracking-[-0.01em] ${isActive ? "font-semibold text-[#1E1B4B]" : "font-medium text-[#1E1B4B]"}`}>
                    {session.title || "새 대화"}
                  </p>
                  {isPinned && <span className="shrink-0 text-[10px] text-black/40" title="고정됨">📌</span>}
                  {isMuted && <span className="shrink-0 text-[10px] text-black/40" title="음소거">🔇</span>}
                </>
              )}
            </div>
            {!isEditing && participantCount > 0 && (
              <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] tracking-[-0.01em] text-black/56">
                <svg className="h-3 w-3 shrink-0 text-black/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span className="shrink-0 font-medium text-black/70">{participantCount}명</span>
                {participantPreview && (
                  <span className="truncate text-black/56">· {participantPreview}</span>
                )}
              </p>
            )}
            {!isEditing && session.lastMessage && (
              <p className="mt-0.5 truncate text-[12px] tracking-[-0.01em] text-black/56">
                {session.lastMessageSenderName && (
                  <span className="font-medium text-black/70">{session.lastMessageSenderName}: </span>
                )}
                {session.lastMessage}
              </p>
            )}
            <div className="mt-1 text-[10px] tracking-[-0.01em] text-black/48">
              {formatSessionDate(session.lastMessageAt || session.updatedAt)}
            </div>
          </div>
          {!isEditing && (
            <div className="mt-0.5 flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
              <button
                type="button"
                onClick={(e) => beginRename(e, session)}
                className="rounded-[8px] p-1 text-black/30 transition-colors hover:bg-black/[0.04] hover:text-black/60"
                title="이름 변경"
                aria-label="대화 이름 변경"
              >
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </button>
              <button
                type="button"
                onClick={(e) => beginDelete(e, session)}
                disabled={deletingId === session.id}
                className="rounded-[8px] p-1 text-black/30 transition-colors hover:bg-[#D85A30]/10 hover:text-[#D85A30] disabled:opacity-50"
                title={(session.participants?.length || 1) > 1 ? "대화방 나가기" : "대화 삭제"}
                aria-label={(session.participants?.length || 1) > 1 ? "대화방 나가기" : "대화 삭제"}
              >
                {deletingId === session.id ? (
                  <span className="block h-3.5 w-3.5 animate-spin rounded-full border border-black/10 border-t-[#D85A30]" />
                ) : (session.participants?.length || 1) > 1 ? (
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                ) : (
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                )}
              </button>
            </div>
          )}
          {unreadCount > 0 && !isEditing && (
            <span className="mt-1 shrink-0 flex h-[20px] min-w-[20px] items-center justify-center rounded-full bg-[#1E1B4B] px-1.5 text-[10px] font-semibold text-white">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </div>
      </li>
    );
  };

  return (
    <>
      {/* 모바일: 바텀 탭 — Apple 글라스 내비게이션 */}
      <nav className="nav-glass fixed bottom-0 left-0 right-0 z-30 flex border-t border-black/[0.06] safe-pb lg:hidden">
        {mobileTabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={tab.onClick}
              className={`relative flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] tracking-[-0.01em] transition-colors ${
                isActive ? "text-[#1E1B4B]" : "text-black/56 hover:text-black/80"
              }`}
            >
              <span className="text-xl leading-none">{tab.icon}</span>
              <span className={isActive ? "font-semibold" : "font-medium"}>{tab.label}</span>
              {tab.badge && tab.badge > 0 ? (
                <span className="absolute right-1/4 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#1E1B4B] px-1 text-[10px] font-semibold text-white">
                  {tab.badge > 99 ? "99+" : tab.badge}
                </span>
              ) : null}
            </button>
          );
        })}
      </nav>

      {/* 데스크톱: 좌측 사이드바 */}
      <aside className="hidden lg:flex lg:w-72 lg:flex-col lg:border-r lg:border-black/[0.08] lg:bg-white">
        {/* 브랜드 락업 */}
        <div className="flex items-center justify-between border-b border-black/[0.06] px-4 py-3">
          <button
            type="button"
            onClick={goHome}
            aria-label="Anima 홈"
            className="flex items-center transition-opacity hover:opacity-80"
          >
            <Logo variant="lockup" tone="light" size={26} priority />
          </button>
        </div>

        {/* 상단 빠른 이동 */}
        <div className="flex items-center gap-1.5 border-b border-black/[0.06] p-2.5">
          <button
            onClick={goHome}
            title="홈"
            aria-label="홈"
            className={`flex shrink-0 items-center justify-center rounded-pill px-2.5 py-2 text-[14px] leading-none transition-colors ${
              activeTab === "home"
                ? "bg-[#1E1B4B] text-white"
                : "text-black/70 hover:bg-black/[0.04]"
            }`}
          >
            🏠
          </button>
          <button
            onClick={goFuture}
            title="미래의 나"
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-pill px-3 py-2 text-[12px] font-medium tracking-[-0.01em] transition-colors ${
              activeTab === "future"
                ? "bg-[#1E1B4B] text-white"
                : "text-black/70 hover:bg-black/[0.04]"
            }`}
          >
            <span className="text-[14px] leading-none">🌟</span>
            <span>미래의 나</span>
          </button>
          <button
            onClick={goAdvisors}
            title="자문단"
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-pill px-3 py-2 text-[12px] font-medium tracking-[-0.01em] transition-colors ${
              activeTab === "advisors"
                ? "bg-[#1E1B4B] text-white"
                : "text-black/70 hover:bg-black/[0.04]"
            }`}
          >
            <span className="text-[14px] leading-none">🧭</span>
            <span>자문단</span>
          </button>
          <button
            onClick={goSettings}
            title="설정"
            aria-label="설정"
            className={`flex shrink-0 items-center justify-center rounded-pill px-2.5 py-2 text-[14px] leading-none transition-colors ${
              activeTab === "settings"
                ? "bg-[#1E1B4B] text-white"
                : "text-black/70 hover:bg-black/[0.04]"
            }`}
          >
            ⚙️
          </button>
        </div>

        {/* 대화 목록 헤더 */}
        <div className="flex items-center justify-between border-b border-black/[0.06] px-4 py-2.5">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-black/48">
            대화 ({chatList.length})
          </h2>
          <button
            onClick={() => setShowNewChat(true)}
            className="rounded-pill bg-[#1E1B4B] px-3 py-1 text-[11px] font-medium text-white transition-colors hover:bg-[#2A2766]"
          >
            + 새 대화
          </button>
        </div>

        {/* 대화 목록 */}
        <div className="flex-1 overflow-y-auto">
          {chatList.length === 0 ? (
            <div className="px-5 py-10 text-center text-[12px] tracking-[-0.01em] text-black/48">
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
    </>
  );
}
