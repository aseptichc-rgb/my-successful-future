"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { onSessionsSnapshot } from "@/lib/firebase";
import { formatRelativeDate } from "@/lib/locale";
import { useGoals } from "@/hooks/useGoals";
import { useDailyTasks } from "@/hooks/useDailyTasks";
import DailyChecklistPanel from "@/components/chat/DailyChecklistPanel";
import NewChatModal from "@/components/chat/NewChatModal";
import type { ChatSession } from "@/types";

interface Props {
  uid: string;
  displayName: string;
  futureSelfId: string | null;
}

function todayKoreanLabel(): string {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });
  return fmt.format(now);
}

export default function HomeDashboard({ uid, displayName, futureSelfId }: Props) {
  const router = useRouter();
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [showNewChat, setShowNewChat] = useState(false);

  const { goals, activeSnapshots } = useGoals(uid);
  const {
    tasksWithTodayState,
    progress,
    addTask,
    toggleTask,
    removeTask,
  } = useDailyTasks(uid);

  useEffect(() => {
    if (!uid) return;
    let active = true;
    const unsub = onSessionsSnapshot(uid, (list) => {
      if (!active) return;
      setSessions(list);
      setSessionsLoading(false);
    });
    return () => {
      active = false;
      unsub();
    };
  }, [uid]);

  // 최근 대화 5개 (DM + 그룹, 고정 우선)
  const recentChats = useMemo(() => {
    const list = sessions.filter(
      (s) => s.sessionType === "dm" || s.sessionType === "group"
    );
    const sorted = [...list].sort((a, b) => {
      const aPinned = a.pinnedBy?.includes(uid) ? 1 : 0;
      const bPinned = b.pinnedBy?.includes(uid) ? 1 : 0;
      if (aPinned !== bPinned) return bPinned - aPinned;
      const aTime = a.lastMessageAt?.toMillis?.() ?? a.updatedAt?.toMillis?.() ?? 0;
      const bTime = b.lastMessageAt?.toMillis?.() ?? b.updatedAt?.toMillis?.() ?? 0;
      return bTime - aTime;
    });
    return sorted.slice(0, 5);
  }, [sessions, uid]);

  const activeGoal = goals[0];
  const activeGoalSnap = activeSnapshots[0];

  const goFutureSelf = () => {
    if (futureSelfId) router.push(`/chat/${futureSelfId}`);
  };
  const goAdvisors = () => router.push("/chat/advisors");
  const goInbox = () => router.push("/chat/inbox");
  const goSession = (id: string) => router.push(`/chat/${id}`);

  return (
    <div className="flex-1 overflow-y-auto bg-[#f8f9fb]">
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
        {/* 인사 헤더 */}
        <header className="mb-5">
          <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">
            안녕하세요, {displayName}님 <span aria-hidden>👋</span>
          </h1>
          <p className="mt-1 text-xs text-gray-500 sm:text-sm">
            {todayKoreanLabel()}
          </p>
        </header>

        {/* 오늘의 목표 진행률 */}
        <section className="mb-4 rounded-2xl border border-gray-200/70 bg-white p-4 shadow-sm">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-base">🎯</span>
              <h2 className="text-sm font-semibold text-gray-900">나의 목표</h2>
              {goals.length > 0 && (
                <span className="text-xs text-gray-400">({goals.length})</span>
              )}
            </div>
            <button
              type="button"
              onClick={goFutureSelf}
              className="text-xs font-medium text-blue-600 hover:text-blue-700"
            >
              관리 →
            </button>
          </div>

          {activeGoal ? (
            <button
              type="button"
              onClick={goFutureSelf}
              className="w-full rounded-xl border border-gray-100 bg-gray-50/60 px-3 py-3 text-left hover:bg-gray-100 transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 flex-1 truncate text-sm font-medium text-gray-900">
                  {activeGoal.title}
                </p>
                <span className="shrink-0 text-xs font-semibold text-blue-600">
                  {activeGoal.progress ?? 0}%
                </span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-200">
                <div
                  className="h-full bg-blue-500 transition-all"
                  style={{ width: `${activeGoal.progress ?? 0}%` }}
                />
              </div>
              {activeGoalSnap?.daysLeft !== undefined && (
                <p className="mt-2 text-[11px] text-gray-500">
                  {activeGoalSnap.daysLeft > 0
                    ? `D-${activeGoalSnap.daysLeft}`
                    : activeGoalSnap.daysLeft === 0
                    ? "오늘 마감"
                    : `${Math.abs(activeGoalSnap.daysLeft)}일 지남`}
                </p>
              )}
            </button>
          ) : (
            <div className="rounded-xl border border-dashed border-gray-200 px-3 py-5 text-center">
              <p className="text-xs text-gray-500">
                아직 등록된 목표가 없어요.
              </p>
              <button
                type="button"
                onClick={goFutureSelf}
                className="mt-2 text-xs font-medium text-blue-600 hover:text-blue-700"
              >
                미래의 나와 대화하며 목표 세우기 →
              </button>
            </div>
          )}
        </section>

        {/* 오늘 체크리스트 (기존 패널 재사용) */}
        <section className="mb-4 overflow-hidden rounded-2xl border border-gray-200/70 bg-white shadow-sm">
          <DailyChecklistPanel
            tasksWithTodayState={tasksWithTodayState}
            progress={progress}
            onAdd={addTask}
            onToggle={toggleTask}
            onRemove={removeTask}
          />
        </section>

        {/* 빠른 진입 CTA */}
        <section className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={goFutureSelf}
            disabled={!futureSelfId}
            className="rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 p-4 text-left text-white shadow-sm transition-transform hover:scale-[1.01] disabled:opacity-60"
          >
            <div className="text-2xl">🌟</div>
            <div className="mt-2 text-sm font-semibold">미래의 나와 대화</div>
            <div className="mt-0.5 text-[11px] text-white/80">
              오늘 하루를 함께 정리해요
            </div>
          </button>
          <button
            type="button"
            onClick={goAdvisors}
            className="rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 p-4 text-left text-white shadow-sm transition-transform hover:scale-[1.01]"
          >
            <div className="text-2xl">🧭</div>
            <div className="mt-2 text-sm font-semibold">자문단 열기</div>
            <div className="mt-0.5 text-[11px] text-white/90">
              고민을 여러 전문가에게 묻기
            </div>
          </button>
        </section>

        {/* 최근 대화 */}
        <section className="rounded-2xl border border-gray-200/70 bg-white p-4 shadow-sm">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-base">💬</span>
              <h2 className="text-sm font-semibold text-gray-900">최근 대화</h2>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={goInbox}
                className="text-xs font-medium text-blue-600 hover:text-blue-700"
              >
                전체 보기 →
              </button>
              <button
                type="button"
                onClick={() => setShowNewChat(true)}
                className="rounded-md bg-blue-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-blue-700"
              >
                + 새 대화
              </button>
            </div>
          </div>

          {sessionsLoading ? (
            <div className="px-2 py-6 text-center text-xs text-gray-400">
              불러오는 중...
            </div>
          ) : recentChats.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-200 px-3 py-6 text-center">
              <p className="text-xs text-gray-500">
                아직 대화가 없어요. 새 대화를 시작해보세요.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {recentChats.map((s) => {
                const unread = s.unreadCounts?.[uid] || 0;
                const ts = s.lastMessageAt || s.updatedAt;
                const when = ts?.toDate ? formatRelativeDate(ts.toDate()) : "";
                const icon = s.sessionType === "dm" ? "💬" : "👥";
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => goSession(s.id)}
                      className="flex w-full items-start gap-2 py-2.5 text-left hover:bg-gray-50 transition-colors"
                    >
                      <span className="mt-0.5 text-base shrink-0">{icon}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-gray-900">
                          {s.title || "새 대화"}
                        </p>
                        {s.lastMessage && (
                          <p className="mt-0.5 truncate text-xs text-gray-500">
                            {s.lastMessageSenderName && (
                              <span className="font-medium">
                                {s.lastMessageSenderName}:{" "}
                              </span>
                            )}
                            {s.lastMessage}
                          </p>
                        )}
                        <p className="mt-0.5 text-[10px] text-gray-400">{when}</p>
                      </div>
                      {unread > 0 && (
                        <span className="mt-1 shrink-0 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
                          {unread > 99 ? "99+" : unread}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      {showNewChat && (
        <NewChatModal
          uid={uid}
          displayName={displayName}
          onClose={() => setShowNewChat(false)}
        />
      )}
    </div>
  );
}
