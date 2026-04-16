"use client";

import { getAuth_, onAuthStateChanged, type FirebaseUser } from "@/lib/firebase";

const AUTH_READY_TIMEOUT_MS = 3000;

/**
 * Firebase 가 아직 currentUser 를 주입하기 전 타이밍에 호출돼도
 * 짧게 대기하도록 한다. 이미 user 가 있으면 즉시 반환.
 */
function waitForCurrentUser(timeoutMs: number): Promise<FirebaseUser | null> {
  const auth = getAuth_();
  if (auth.currentUser) return Promise.resolve(auth.currentUser);
  return new Promise((resolve) => {
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      unsub();
      resolve(auth.currentUser);
    }, timeoutMs);
    const unsub = onAuthStateChanged(auth, (fb) => {
      if (done || !fb) return;
      done = true;
      clearTimeout(timer);
      unsub();
      resolve(fb);
    });
  });
}

/**
 * 로그인된 사용자의 Firebase ID 토큰을 Authorization 헤더로 실어 보내는 fetch.
 *
 * - currentUser 가 아직 주입되지 않은 경우 최대 3초 대기 후 재시도.
 * - 토큰이 비어 있거나 발급 실패 시 명시적 에러를 던진다 —
 *   UI 쪽에서 err.message 를 그대로 노출해도 사용자에게 의미 있도록.
 */
export async function authedFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const user = await waitForCurrentUser(AUTH_READY_TIMEOUT_MS);
  if (!user) throw new Error("로그인이 필요합니다. 다시 로그인 후 시도해주세요.");

  let token: string;
  try {
    token = await user.getIdToken();
  } catch (err) {
    throw new Error(
      `인증 토큰을 가져오지 못했습니다: ${err instanceof Error ? err.message : String(err)}`
    );
  }
  if (!token) throw new Error("인증 토큰이 비어 있습니다. 다시 로그인해주세요.");

  const headers = new Headers(init.headers || {});
  headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return fetch(input, { ...init, headers });
}
