"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Timestamp } from "firebase/firestore";
import {
  onGoalsSnapshot,
  createGoal,
  updateGoal,
  checkinGoal,
  deleteGoal,
} from "@/lib/firebase";
import type { Goal, GoalCategory, GoalSnapshot } from "@/types";

function toSnapshot(goal: Goal): GoalSnapshot {
  const snap: GoalSnapshot = {
    title: goal.title,
    category: goal.category,
    progress: goal.progress ?? 0,
    lastCheckinNote: goal.lastCheckinNote,
  };
  if (goal.targetDate) {
    const ms = goal.targetDate.toMillis();
    const iso = new Date(ms).toISOString().slice(0, 10);
    snap.targetDateISO = iso;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(ms);
    target.setHours(0, 0, 0, 0);
    snap.daysLeft = Math.round((target.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
  }
  return snap;
}

export function useGoals(uid: string | undefined) {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) return;
    const unsub = onGoalsSnapshot(uid, (list) => {
      setGoals(list);
      setLoading(false);
    });
    return unsub;
  }, [uid]);

  // 프롬프트 주입용 스냅샷 (가장 마감 임박한 것 또는 체크인 된 것 3개)
  const activeSnapshots = useMemo<GoalSnapshot[]>(() => {
    return goals.slice(0, 3).map(toSnapshot);
  }, [goals]);

  const addGoal = useCallback(
    async (params: {
      title: string;
      category: GoalCategory;
      description?: string;
      targetDate?: Date;
    }) => {
      if (!uid) return;
      await createGoal(uid, {
        title: params.title,
        category: params.category,
        description: params.description,
        targetDate: params.targetDate ? Timestamp.fromDate(params.targetDate) : undefined,
        progress: 0,
      });
    },
    [uid]
  );

  const editGoal = useCallback(
    async (goalId: string, updates: Partial<Goal>) => {
      if (!uid) return;
      await updateGoal(uid, goalId, updates);
    },
    [uid]
  );

  const checkin = useCallback(
    async (goalId: string, progress: number, note?: string) => {
      if (!uid) return;
      await checkinGoal(uid, goalId, progress, note);
    },
    [uid]
  );

  const removeGoal = useCallback(
    async (goalId: string) => {
      if (!uid) return;
      await deleteGoal(uid, goalId);
    },
    [uid]
  );

  return {
    goals,
    loading,
    activeSnapshots,
    addGoal,
    editGoal,
    checkin,
    removeGoal,
  };
}
