"use client";

import { useEffect, useState } from "react";
import type { User as FirebaseUser } from "firebase/auth";
import { onExecutionPlansSnapshot, type ExecutionPlanWithId } from "@/lib/firebase";

/**
 * WOOP 실행설계 목록 구독 — 홈·설정이 같은 게이트 정책을 공유한다.
 *
 * plansLoaded 는 "지금 계정의 첫 스냅샷이 도착했는가" — 도착 전 planCount 0 으로
 * 해금(computePlanUnlock)을 오판하지 않기 위한 게이트다. 결과를 uid 와 함께 저장하므로
 * 계정이 바뀌는 순간 파생값이 저절로 "로딩 전"이 된다(효과 본문 setState 불필요).
 *
 * 구독 실패(규칙 미배포 등)는 "플랜 0개로 로딩 완료"로 판정한다 — 섹션만 비우고
 * 화면 나머지는 정상 동작. 이 정책을 바꿀 땐 여기 한 곳만 고치면 두 화면이 함께 바뀐다.
 */
export function useExecutionPlans(firebaseUser: FirebaseUser | null | undefined): {
  plans: ExecutionPlanWithId[];
  plansLoaded: boolean;
} {
  const [snap, setSnap] = useState<{ uid: string; plans: ExecutionPlanWithId[] } | null>(null);

  useEffect(() => {
    if (!firebaseUser) return;
    const uid = firebaseUser.uid;
    const unsub = onExecutionPlansSnapshot(
      uid,
      (next) => setSnap({ uid, plans: next }),
      () => setSnap({ uid, plans: [] }),
    );
    return unsub;
  }, [firebaseUser]);

  const current = firebaseUser && snap?.uid === firebaseUser.uid ? snap : null;
  return { plans: current?.plans ?? [], plansLoaded: current !== null };
}
