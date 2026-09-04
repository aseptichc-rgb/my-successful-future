"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { User as FirebaseUser } from "firebase/auth";
import { useAuth } from "@/lib/auth-context";
import { getDailyEntryOnce, markWinsUnlocked, type ExecutionPlanWithId } from "@/lib/firebase";
import { yesterdayKstYmd } from "@/lib/kstDate";
import { docKey } from "@/lib/docKey";
import { useResolvedYmd } from "@/lib/useResolvedYmd";
import { useTodayEntry } from "@/lib/useTodayEntry";
import { useExecutionPlans } from "@/lib/useExecutionPlans";
import { computeGoalSlots, type GoalSlotState } from "@/lib/goalSlots";
import { computePlanUnlock, type PlanUnlockState } from "@/lib/planUnlock";
import { computeWinsUnlock, hasAnyWin, type WinsUnlockState } from "@/lib/winsUnlock";
import { isPaidPro } from "@/lib/entitlement";
import type { DailyEntry } from "@/types";

/* ─────────────────────────────────────────────────────────────────
 * TodayDataProvider — 탭 4개(오늘·기록·성장·내 꿈)가 공유하는 "오늘" 데이터.
 *
 * 탭 레이아웃(app/(tabs)/layout.tsx)에 한 번 마운트된다. 레이아웃은 형제 라우트 이동에도
 * 살아 있으므로 오늘 문서 구독·날짜·실행 설계 목록이 탭 전환을 견딘다 — 기록 탭이
 * 빈 칸 → 채워짐으로 깜빡이지 않고, 자정 롤오버 때 모든 탭이 같은 날짜를 본다.
 *
 * 시간대 모드(lib/homeMode)는 여기 두지 않는다 — 각 화면이 렌더마다 currentHomeMode() 를
 * 불러 화면을 열어둔 채 시간 경계를 넘겨도 다음 렌더에 반영되게 한다.
 * ───────────────────────────────────────────────────────────────── */

export interface TodayData {
  uid: string;
  /** 지금 화면의 날짜(KST) — qDate 딥링크·자정 롤오버를 useResolvedYmd 가 처리한다. */
  ymd: string;
  currentKey: string;
  entry: DailyEntry | null;
  entryLoaded: boolean;
  achievedGoals: string[];
  goalSaving: boolean;
  toggleGoalAchieved: (goal: string) => Promise<void>;
  plans: ExecutionPlanWithId[];
  plansLoaded: boolean;
  /** 실행 설계 해금. null = 플랜 첫 스냅샷 전 — 영역을 그리지 않는다(깜빡임 방지). */
  planUnlock: PlanUnlockState | null;
  /** 잘한 일 기록 해금. null = 오늘·어제 문서 도착 전 — 잠금 행조차 그리지 않는다. */
  winsUnlock: WinsUnlockState | null;
  goalSlots: GoalSlotState;
  /** 결제 프로(평생/구독) — 모든 해금 게이트를 첫날부터 통과. 트라이얼은 제외. */
  proUnlockAll: boolean;
  /** 어제 저녁에 적은 "내일 첫 행동". 없거나 조회 실패면 null. */
  yesterdayFirstAction: string | null;
}

const TodayDataContext = createContext<TodayData | null>(null);

/**
 * 어제 문서 1회 조회 — "내일 첫 행동"(아침 카드 보조 행)과 "어제 잘한 일을 적었는가"
 * (잘한 일 해금의 기존 사용자 보존 신호)를 같은 읽기로 얻는다.
 * 결과를 키(uid:ymd)와 함께 담아 계정·날짜가 바뀌면 저절로 판정 보류(null)가 된다.
 */
function useYesterdayEntry(
  firebaseUser: FirebaseUser | null | undefined,
  ymd: string,
  currentKey: string,
): { firstAction: string | null; hadWins: boolean | null } {
  const [snap, setSnap] = useState<{
    key: string;
    firstAction: string | null;
    hadWins: boolean;
  } | null>(null);

  useEffect(() => {
    if (!firebaseUser) return;
    let cancelled = false;
    const key = docKey(firebaseUser.uid, ymd);
    getDailyEntryOnce(firebaseUser.uid, yesterdayKstYmd(ymd))
      .then((prev) => {
        if (cancelled) return;
        const txt = (prev?.tomorrowFirstAction ?? "").trim();
        setSnap({ key, firstAction: txt.length > 0 ? txt : null, hadWins: hasAnyWin(prev?.wins) });
      })
      .catch((err) => {
        console.error("[today] 어제 문서 조회 실패(생략):", err);
        if (cancelled) return;
        // 조회 실패는 보존 신호만 포기하고 판정은 진행 — 잠금 화면에 갇히지 않게.
        setSnap({ key, firstAction: null, hadWins: false });
      });
    return () => {
      cancelled = true;
    };
  }, [firebaseUser, ymd]);

  const cur = snap && snap.key === currentKey ? snap : null;
  return { firstAction: cur?.firstAction ?? null, hadWins: cur ? cur.hadWins : null };
}

export function TodayDataProvider({ children }: { children: ReactNode }) {
  const { user, firebaseUser, entitlement } = useAuth();
  const ymd = useResolvedYmd();
  const today = useTodayEntry(firebaseUser, ymd);
  const { plans, plansLoaded } = useExecutionPlans(firebaseUser);
  const yesterday = useYesterdayEntry(firebaseUser, ymd, today.currentKey);

  const goals = user?.goals ?? [];
  const uid = firebaseUser?.uid ?? "";

  /** 어제·오늘 문서에 기록이 있는가 — 잘한 일 해금의 "이미 쓰던 계정" 신호(추가 조회 없음). */
  const winsRecordedRecently = hasAnyWin(today.entry?.wins) || yesterday.hadWins === true;

  /* 잘한 일 보존 표식 — 해금 게이트 도입 전부터 기록을 쓰던 계정에 딱 한 번 찍는다.
   * 표식이 없고 최근 기록이 확인될 때만 쓰므로 계정당 최대 1회 쓰기이고, 그 뒤로는
   * 어제·오늘 문서와 무관하게 영구히 열린다(기록을 하루 걸렀다고 다시 잠그지 않는다).
   * 실패해도 화면은 이미 열려 있으므로 조용히 넘기고 다음 방문에서 다시 시도한다. */
  const winsUnlockMarkedRef = useRef(false);
  useEffect(() => {
    if (!firebaseUser || !user || user.winsUnlockedAt) return;
    if (!today.entryLoaded || !winsRecordedRecently) return;
    if (winsUnlockMarkedRef.current) return;
    winsUnlockMarkedRef.current = true;
    markWinsUnlocked(firebaseUser.uid).catch((err) => {
      console.error("[today] 잘한 일 보존 표식 저장 실패(다음 방문에 재시도):", err);
      winsUnlockMarkedRef.current = false;
    });
  }, [firebaseUser, user, today.entryLoaded, winsRecordedRecently]);

  // 결제 프로(평생/구독)는 모든 해금 게이트를 첫날부터 통과한다 — 트라이얼은 제외
  // (트라이얼은 전원 자동 시작이라 포함하면 해금 여정 자체가 사라진다).
  const proUnlockAll = isPaidPro(entitlement);

  const value = useMemo<TodayData>(() => {
    // 해금 게이지는 다짐 전사·목표 달성 두 축 중 큰 값으로 찬다.
    const goalSlots = computeGoalSlots({
      affirmation: user?.affirmationStreak,
      goal: user?.goalStreak,
      currentGoalCount: goals.length,
      unlockAll: proUnlockAll,
    });
    const planUnlock = plansLoaded
      ? computePlanUnlock({
          affirmation: user?.affirmationStreak,
          goal: user?.goalStreak,
          goalCount: goals.filter((g) => g.trim().length > 0).length,
          planCount: plans.length,
          unlockAll: proUnlockAll,
        })
      : null;
    const winsUnlock =
      today.entryLoaded && yesterday.hadWins !== null
        ? computeWinsUnlock({
            affirmation: user?.affirmationStreak,
            goal: user?.goalStreak,
            alreadyRecorded: Boolean(user?.winsUnlockedAt) || winsRecordedRecently,
            unlockAll: proUnlockAll,
          })
        : null;
    return {
      uid,
      ymd,
      currentKey: today.currentKey,
      entry: today.entry,
      entryLoaded: today.entryLoaded,
      achievedGoals: today.achievedGoals,
      goalSaving: today.goalSaving,
      toggleGoalAchieved: today.toggleGoalAchieved,
      plans,
      plansLoaded,
      planUnlock,
      winsUnlock,
      goalSlots,
      proUnlockAll,
      yesterdayFirstAction: yesterday.firstAction,
    };
    // goals 는 user 에서 파생한 새 배열이라 user 로 갈음한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    uid,
    ymd,
    user,
    today.currentKey,
    today.entry,
    today.entryLoaded,
    today.achievedGoals,
    today.goalSaving,
    today.toggleGoalAchieved,
    plans,
    plansLoaded,
    proUnlockAll,
    yesterday.firstAction,
    yesterday.hadWins,
    winsRecordedRecently,
  ]);

  return <TodayDataContext.Provider value={value}>{children}</TodayDataContext.Provider>;
}

export function useTodayData(): TodayData {
  const ctx = useContext(TodayDataContext);
  if (!ctx) throw new Error("useTodayData must be used within TodayDataProvider");
  return ctx;
}
