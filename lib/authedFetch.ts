"use client";

import { getAuth_, onAuthStateChanged, type FirebaseUser } from "@/lib/firebase";
import { notifyPaymentRequired, PAYMENT_REQUIRED_STATUS } from "@/lib/paymentRequired";

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

/** Authorization 헤더(+ JSON Content-Type)를 얹은 RequestInit 사본을 만든다. */
function withAuthHeaders(init: RequestInit, token: string): RequestInit {
  const headers = new Headers(init.headers || {});
  headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return { ...init, headers };
}

/**
 * 402 재시도로 같은 본문을 한 번 더 보내도 안전한지.
 * ReadableStream 본문은 1회용이라 재전송하면 이미 소비된 스트림이 실려 나간다 —
 * 그런 요청은 재시도하지 않고 첫 응답을 그대로 돌려준다.
 */
function isReplayableBody(body: BodyInit | null | undefined): boolean {
  if (body === null || body === undefined) return true;
  return (
    typeof body === "string" ||
    body instanceof FormData ||
    body instanceof URLSearchParams ||
    body instanceof Blob ||
    body instanceof ArrayBuffer ||
    ArrayBuffer.isView(body)
  );
}

/**
 * 로그인된 사용자의 Firebase ID 토큰을 Authorization 헤더로 실어 보내는 fetch.
 *
 * - currentUser 가 아직 주입되지 않은 경우 최대 3초 대기 후 재시도.
 * - 토큰이 비어 있거나 발급 실패 시 명시적 에러를 던진다 —
 *   UI 쪽에서 err.message 를 그대로 노출해도 사용자에게 의미 있도록.
 * - 402(Pro 전용 기능)를 만나면 ID 토큰을 강제 갱신해 **1회만** 재시도한다.
 *   결제/체험 claim 이 방금 박혔는데 캐시된 토큰이 아직 옛 claim 인 타이밍(결제 직후·가입 직후)이
 *   정확히 여기라, 이 재시도 하나로 "돈 냈는데도 막힌다" 는 최악의 오탐을 걷어낸다.
 *   그래도 402 면 [notifyPaymentRequired] 로 업그레이드 시트를 띄운다.
 *
 * 반환값은 언제나 Response — 402 자체를 예외로 승격시키지 않는다. 기존 호출부들이
 * `res.ok` 로 분기하고 있어서, 여기서 throw 하면 그 분기들이 통째로 깨진다.
 */
export async function authedFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const user = await waitForCurrentUser(AUTH_READY_TIMEOUT_MS);
  if (!user) throw new Error("You need to sign in. Please sign in and try again.");

  let token: string;
  try {
    token = await user.getIdToken();
  } catch (err) {
    throw new Error(
      `인증 토큰을 가져오지 못했습니다: ${err instanceof Error ? err.message : String(err)}`
    );
  }
  if (!token) throw new Error("The auth token is empty. Please sign in again.");

  const response = await fetch(input, withAuthHeaders(init, token));
  if (response.status !== PAYMENT_REQUIRED_STATUS) return response;

  // ── 여기서부터 402 구제 경로 ──────────────────────────────────
  if (!isReplayableBody(init.body)) {
    notifyPaymentRequired();
    return response;
  }

  let refreshed: string | null = null;
  try {
    refreshed = await user.getIdToken(true);
  } catch (err) {
    console.warn("[authedFetch] 402 후 토큰 강제 갱신 실패:", err);
  }
  if (!refreshed) {
    notifyPaymentRequired();
    return response;
  }

  try {
    const retried = await fetch(input, withAuthHeaders(init, refreshed));
    if (retried.status === PAYMENT_REQUIRED_STATUS) notifyPaymentRequired();
    return retried;
  } catch (err) {
    // 재시도가 네트워크 사유로 실패 — 첫 402 응답을 그대로 돌려주되 페이월은 띄운다.
    console.warn("[authedFetch] 402 재시도 실패:", err);
    notifyPaymentRequired();
    return response;
  }
}
