"use client";

import { saveFCMToken, removeFCMToken as removeToken } from "./firebase";
import { initializeApp, getApps, getApp } from "firebase/app";

let messagingInstance: ReturnType<typeof import("firebase/messaging").getMessaging> | null = null;

function getFirebaseApp() {
  return getApps().length > 0 ? getApp() : initializeApp({
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  });
}

async function getMessagingInstance() {
  if (messagingInstance) return messagingInstance;
  const { getMessaging, isSupported } = await import("firebase/messaging");
  const supported = await isSupported();
  if (!supported) return null;
  messagingInstance = getMessaging(getFirebaseApp());
  return messagingInstance;
}

/**
 * 브라우저 알림 권한 요청 + FCM 토큰 발급 + Firestore 저장
 * @returns FCM 토큰 문자열 또는 null
 */
export async function requestNotificationPermission(uid: string): Promise<string | null> {
  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return null;

    const messaging = await getMessagingInstance();
    if (!messaging) return null;

    const { getToken } = await import("firebase/messaging");
    const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;

    // 서비스 워커 등록 후 활성화될 때까지 대기
    // (등록 직후에는 installing/waiting 상태일 수 있어 PushManager 구독이 실패함)
    await navigator.serviceWorker.register("/firebase-messaging-sw.js");
    const sw = await navigator.serviceWorker.ready;

    const token = await getToken(messaging, {
      vapidKey: vapidKey || undefined,
      serviceWorkerRegistration: sw,
    });

    if (token) {
      await saveFCMToken(uid, token);
    }
    return token;
  } catch (err) {
    console.error("FCM 토큰 발급 실패:", err);
    return null;
  }
}

/**
 * FCM 토큰 제거 (로그아웃 시 호출)
 */
export async function removeFCMTokenForUser(uid: string): Promise<void> {
  try {
    const messaging = await getMessagingInstance();
    if (!messaging) return;

    const { getToken } = await import("firebase/messaging");
    const sw = await navigator.serviceWorker.getRegistration("/firebase-messaging-sw.js");

    const token = await getToken(messaging, {
      serviceWorkerRegistration: sw || undefined,
    });

    if (token) {
      await removeToken(uid, token);
    }
  } catch (err) {
    console.error("FCM 토큰 제거 실패:", err);
  }
}

/**
 * 포그라운드 메시지 수신 리스너
 */
export function onForegroundMessage(
  callback: (payload: { title?: string; body?: string; sessionId?: string }) => void
): () => void {
  let unsubscribe: (() => void) | null = null;

  getMessagingInstance().then(async (messaging) => {
    if (!messaging) return;
    const { onMessage } = await import("firebase/messaging");
    unsubscribe = onMessage(messaging, (payload) => {
      const data = payload.data || {};
      callback({
        title: data.title || payload.notification?.title,
        body: data.body || payload.notification?.body,
        sessionId: data.sessionId,
      });
    });
  });

  return () => {
    if (unsubscribe) unsubscribe();
  };
}
