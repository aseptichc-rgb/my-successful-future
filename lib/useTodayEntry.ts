"use client";

import { useCallback, useEffect, useState } from "react";
import type { User as FirebaseUser } from "firebase/auth";
import { onDailyEntrySnapshot, saveDailyAchievedGoals } from "@/lib/firebase";
import { docKey } from "@/lib/docKey";
import { notifyAndroidWidgetRefresh } from "@/lib/widgetBridge";
import { refreshIosWidget } from "@/lib/iosWidget";
import { useT } from "@/lib/i18n";
import type { DailyEntry } from "@/types";

export interface TodayEntryState {
  /** 지금 화면의 계정·날짜 키 — 키 태그 스냅샷이 이 값과 비교한다. */
  currentKey: string;
  /** 오늘 문서. 스냅샷 도착 전(키 불일치)에는 null. */
  entry: DailyEntry | null;
  /** 이 계정·날짜의 스냅샷이 한 번이라도 도착했는가. false 동안은 초안을 덮어쓰지 않는다. */
  entryLoaded: boolean;
  achievedGoals: string[];
  goalSaving: boolean;
  /** 목표 달성 토글 — 오늘 카드(첫 목표)와 추가 목표 행이 공유한다. */
  toggleGoalAchieved: (goal: string) => Promise<void>;
}

/**
 * 오늘 문서(dailyEntries/{ymd}) 구독 + 목표 달성 토글.
 *
 * 목표 달성 토글(오늘 탭)과 기록 입력(기록 탭)이 같은 구독을 공유한다 — 탭 레이아웃의
 * 컨텍스트(lib/today-context)가 한 번만 호출하고 두 탭이 읽는다.
 * 키가 어긋나면(계정·날짜 전환 직후) 파생 entry/entryLoaded 가 저절로 "로딩 전"이 된다.
 */
export function useTodayEntry(
  firebaseUser: FirebaseUser | null | undefined,
  ymd: string,
): TodayEntryState {
  const t = useT();
  const uid = firebaseUser?.uid ?? "";
  const currentKey = docKey(firebaseUser?.uid, ymd);

  const [entrySnap, setEntrySnap] = useState<{ key: string; entry: DailyEntry | null } | null>(
    null,
  );
  const [achievedGoals, setAchievedGoals] = useState<string[]>([]);
  const [goalSaving, setGoalSaving] = useState(false);

  useEffect(() => {
    if (!firebaseUser) return;
    // 키를 함께 저장한다 — 계정·날짜가 바뀌면 파생값이 새 문서를 기다린다(전날 값이 남지 않도록).
    const key = docKey(firebaseUser.uid, ymd);
    const unsub = onDailyEntrySnapshot(firebaseUser.uid, ymd, (next: DailyEntry | null) => {
      setEntrySnap({ key, entry: next });
      setAchievedGoals(Array.isArray(next?.achievedGoals) ? next.achievedGoals : []);
    });
    return unsub;
  }, [firebaseUser, ymd]);

  const curEntry = entrySnap?.key === currentKey ? entrySnap : null;

  const toggleGoalAchieved = useCallback(
    async (goalText: string) => {
      const trimmed = goalText.trim();
      if (!trimmed || !uid) return;
      // Android intent 는 현재 탭 user-activation 이 살아 있는 첫 await 전에만 신호.
      notifyAndroidWidgetRefresh();
      const prev = achievedGoals;
      const next = prev.includes(trimmed)
        ? prev.filter((g) => g !== trimmed)
        : [...prev, trimmed];
      setAchievedGoals(next);
      setGoalSaving(true);
      try {
        await saveDailyAchievedGoals(uid, ymd, next);
        void refreshIosWidget();
      } catch (err) {
        console.error("[today] 목표 달성 저장 실패:", err);
        setAchievedGoals(prev);
        window.alert(t("common.saveFailed"));
      } finally {
        setGoalSaving(false);
      }
    },
    [achievedGoals, t, uid, ymd],
  );

  return {
    currentKey,
    entry: curEntry?.entry ?? null,
    entryLoaded: curEntry !== null,
    achievedGoals,
    goalSaving,
    toggleGoalAchieved,
  };
}
