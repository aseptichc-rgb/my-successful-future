"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/* ─────────────────────────────────────────────────────────────────
 * useSheetHistory — 바텀 시트 하나를 브라우저 히스토리 엔트리 하나로.
 *
 * Android(TWA) 뒤로가기는 Chrome 히스토리 back 이다. 시트가 히스토리에 없으면 시트가 열린
 * 채 뒤로가기를 눌렀을 때 시트가 아니라 **앱이 닫힌다**. 그래서 시트가 마운트될 때 URL 은
 * 그대로 둔 채 state 만 다른 엔트리를 하나 push 하고, popstate 로 그 엔트리를 벗어나면 시트를
 * 닫는다. 취소·배경 탭도 같은 경로(history.back)로 닫아 히스토리가 매달리지 않게 한다.
 *
 * Next App Router 와의 공존: Next 는 window.history.pushState 를 패치해 자기 내부 트리(__NA)를
 * state 에 얹는다. 우리 push 도 그 패치를 거치므로 뒤로/앞으로 모두 Next 가 정상 복원한다
 * (state 에 __NA 가 없는 엔트리로 popstate 가 오면 Next 는 페이지를 리로드한다 — 그래서
 * 반드시 window.history.pushState 를 써야 하고 원본을 우회하면 안 된다).
 *
 * 부모가 프로그램적으로 닫을 때(저장 후 onClose): 클린업이 우리 엔트리가 아직 맨 위면
 * back() 으로 걷어낸다 — 안 하면 다음 뒤로가기가 아무 일도 안 하는 것처럼 보인다.
 * 시트를 연 채 다른 페이지로 갈 때(계정 삭제 → /login)는 시트를 먼저 닫지 말 것: Next 가
 * 새 URL 을 먼저 쓰고 클린업은 남의 state 를 보고 back() 을 건너뛴다.
 * ───────────────────────────────────────────────────────────────── */

const STATE_KEY = "animaSheet";

let sequence = 0;
function makeToken(): string {
  sequence += 1;
  return `sheet-${Date.now().toString(36)}-${sequence.toString(36)}`;
}

/** 지금 맨 위 히스토리 엔트리에 실린 시트 토큰. 없거나 접근 불가면 null. */
function topToken(): string | null {
  try {
    const state = window.history.state as Record<string, unknown> | null;
    const value = state?.[STATE_KEY];
    return typeof value === "string" ? value : null;
  } catch {
    return null;
  }
}

/**
 * @param onClose 시트를 실제로 내리는 콜백(부모 state 변경).
 * @returns requestClose — 취소·배경 탭에서 부를 닫기. 우리 엔트리가 맨 위면 back() 으로,
 *   아니면 onClose 로 닫는다.
 */
export function useSheetHistory(onClose: () => void): () => void {
  // 토큰은 마운트당 하나 — StrictMode 의 이중 효과 실행에도 같은 값이라 엔트리가 두 개 쌓여도
  // 판정이 어긋나지 않는다(앞으로가기 엔트리 하나가 남을 뿐, 무해).
  const [token] = useState(makeToken);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    try {
      const current = (window.history.state as Record<string, unknown> | null) ?? {};
      window.history.pushState({ ...current, [STATE_KEY]: token }, "");
    } catch {
      return; // 히스토리 조작 불가 환경 — 시트는 부모 state 로만 닫힌다.
    }
    const onPopState = () => {
      if (topToken() === token) return; // 아직 우리 엔트리가 맨 위(앞으로가기로 돌아온 경우)
      onCloseRef.current();
    };
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
      if (topToken() === token) {
        try {
          window.history.back();
        } catch {
          /* 무시 — 엔트리 하나가 남을 뿐 */
        }
      }
    };
  }, [token]);

  return useCallback(() => {
    if (topToken() === token) {
      try {
        window.history.back();
        return; // popstate → onClose
      } catch {
        /* 폴백: 아래에서 직접 닫는다 */
      }
    }
    onCloseRef.current();
  }, [token]);
}
