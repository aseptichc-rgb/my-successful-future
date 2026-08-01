"use client";

import { useEffect, useState } from "react";
import type { User as FirebaseUser } from "firebase/auth";

/**
 * "계정 기준 1회 조회 + 재시도" 훅 — progress·wins-history 가 공유한다.
 *
 * 결과를 키(uid:시도번호)와 함께 저장하므로 계정 전환·재시도 순간 파생값이 저절로
 * 로딩 상태로 돌아간다(효과 본문 setState 불필요). 실패도 "로딩 완료 + failed"로
 * 판정해 화면이 스켈레톤에 갇히지 않고 재시도 UI 를 열 수 있게 한다.
 *
 * load 는 참조가 안정적이어야 한다(모듈 함수 또는 useCallback) — 바뀌면 다시 조회한다.
 */
export function useRetryableLoad<T>(
  firebaseUser: FirebaseUser | null | undefined,
  load: (uid: string) => Promise<T>,
): { data: T | null; loading: boolean; failed: boolean; retry: () => void } {
  const [result, setResult] = useState<{ key: string; data: T | null; failed: boolean } | null>(
    null,
  );
  // 재시도 버튼이 올리는 시도 번호 — 키가 어긋나며 로딩으로 돌아가고 효과가 다시 조회한다.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!firebaseUser) return;
    const key = `${firebaseUser.uid}:${attempt}`;
    let cancelled = false;
    load(firebaseUser.uid)
      .then((data) => {
        if (!cancelled) setResult({ key, data, failed: false });
      })
      .catch((err) => {
        console.error("[useRetryableLoad] 조회 실패:", err);
        if (!cancelled) setResult({ key, data: null, failed: true });
      });
    return () => {
      cancelled = true;
    };
  }, [firebaseUser, attempt, load]);

  const current =
    firebaseUser && result?.key === `${firebaseUser.uid}:${attempt}` ? result : null;
  return {
    data: current?.data ?? null,
    loading: current === null,
    failed: current?.failed ?? false,
    retry: () => setAttempt((n) => n + 1),
  };
}
