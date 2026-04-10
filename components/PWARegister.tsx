"use client";

import { useEffect } from "react";

/**
 * PWA 서비스 워커 등록 컴포넌트.
 * - 프로덕션 환경에서만 등록한다 (개발 중 캐시로 인한 혼란 방지).
 * - FCM의 /firebase-messaging-sw.js 와는 별개 파일이라 충돌하지 않는다.
 */
export default function PWARegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return;

    const register = () => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .catch((err) => {
          console.warn("[PWA] Service worker registration failed:", err);
        });
    };

    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register);
      return () => window.removeEventListener("load", register);
    }
  }, []);

  return null;
}
