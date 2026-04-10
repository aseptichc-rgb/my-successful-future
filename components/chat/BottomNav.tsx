"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { onSessionsSnapshot, ensureFutureSelfSession } from "@/lib/firebase";
import type { ChatSession } from "@/types";

interface BottomNavProps {
  uid: string;
  displayName: string;
}

type Tab = "future" | "advisors" | "inbox";

export default function BottomNav({ uid, displayName }: BottomNavProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [futureSelfId, setFutureSelfId] = useState<string | null>(null);

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

  // 받은편지함(DM/그룹)의 미확인 카운트 합산
  const inboxUnread = sessions
    .filter((s) => s.sessionType === "dm" || s.sessionType === "group")
    .reduce((sum, s) => sum + (s.unreadCounts?.[uid] || 0), 0);

  // 현재 활성 탭 판정
  const activeTab: Tab | null = (() => {
    if (pathname === "/chat/advisors") return "advisors";
    if (pathname === "/chat/inbox") return "inbox";
    if (pathname?.startsWith("/chat/")) {
      const id = pathname.split("/")[2];
      // future-self 세션이면 future, 그 외 ai 세션이면 advisors, dm/group이면 inbox
      const session = sessions.find((s) => s.id === id);
      if (!session) return "future"; // 기본은 future
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

  const tabs: {
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

  return (
    <>
      {/* 모바일: 바텀 탭 */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 flex border-t border-gray-200 bg-white lg:hidden">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={tab.onClick}
              className={`relative flex flex-1 flex-col items-center gap-0.5 py-2 text-xs transition-colors ${
                isActive ? "text-blue-600" : "text-gray-500 hover:text-gray-700"
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

      {/* 데스크톱: 좌측 슬림 레일 */}
      <nav className="hidden lg:flex lg:w-16 lg:flex-col lg:items-center lg:gap-2 lg:border-r lg:border-gray-200 lg:bg-white lg:py-4">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={tab.onClick}
              title={tab.label}
              className={`relative flex h-14 w-14 flex-col items-center justify-center gap-0.5 rounded-xl text-[10px] transition-colors ${
                isActive
                  ? "bg-blue-50 text-blue-600"
                  : "text-gray-500 hover:bg-gray-100 hover:text-gray-700"
              }`}
            >
              <span className="text-xl leading-none">{tab.icon}</span>
              <span className={isActive ? "font-semibold" : ""}>{tab.label}</span>
              {tab.badge && tab.badge > 0 ? (
                <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                  {tab.badge > 99 ? "99+" : tab.badge}
                </span>
              ) : null}
            </button>
          );
        })}
      </nav>
    </>
  );
}
