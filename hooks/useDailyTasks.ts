"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  onDailyTasksSnapshot,
  createDailyTask,
  updateDailyTask,
  deleteDailyTask,
  toggleDailyTaskToday,
} from "@/lib/firebase";
import type { DailyTask, DailyTaskSnapshot } from "@/types";

function kstToday(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const d = String(kst.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function useDailyTasks(uid: string | undefined) {
  const [tasks, setTasks] = useState<DailyTask[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) return;
    const unsub = onDailyTasksSnapshot(uid, (list) => {
      setTasks(list);
      setLoading(false);
    });
    return unsub;
  }, [uid]);

  // 오늘 기준 완료 여부 계산
  const today = kstToday();
  const tasksWithTodayState = useMemo(
    () =>
      tasks.map((t) => ({
        task: t,
        doneToday: t.lastCompletedDate === today,
      })),
    [tasks, today]
  );

  // 프롬프트 주입용 스냅샷
  const snapshots = useMemo<DailyTaskSnapshot[]>(
    () =>
      tasksWithTodayState.map(({ task, doneToday }) => ({
        title: task.title,
        done: doneToday,
        streakCount: task.streakCount ?? 0,
      })),
    [tasksWithTodayState]
  );

  const addTask = useCallback(
    async (title: string, icon?: string) => {
      if (!uid || !title.trim()) return;
      await createDailyTask(uid, title.trim(), icon);
    },
    [uid]
  );

  const toggleTask = useCallback(
    async (task: DailyTask) => {
      if (!uid) return;
      await toggleDailyTaskToday(uid, task);
    },
    [uid]
  );

  const editTask = useCallback(
    async (taskId: string, updates: Partial<Pick<DailyTask, "title" | "icon" | "order">>) => {
      if (!uid) return;
      await updateDailyTask(uid, taskId, updates);
    },
    [uid]
  );

  const removeTask = useCallback(
    async (taskId: string) => {
      if (!uid) return;
      await deleteDailyTask(uid, taskId);
    },
    [uid]
  );

  // 진척률 (오늘 완료/전체)
  const progress = useMemo(() => {
    if (tasks.length === 0) return { done: 0, total: 0, percent: 0 };
    const doneCount = tasksWithTodayState.filter((t) => t.doneToday).length;
    return {
      done: doneCount,
      total: tasks.length,
      percent: Math.round((doneCount / tasks.length) * 100),
    };
  }, [tasks.length, tasksWithTodayState]);

  return {
    tasks,
    tasksWithTodayState,
    snapshots,
    progress,
    loading,
    addTask,
    toggleTask,
    editTask,
    removeTask,
  };
}
